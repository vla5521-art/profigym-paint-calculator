import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server/app.js';
import { closeCadKernel } from '../server/cad/kernel.js';
import { clearJobs } from '../server/jobs.js';

async function withServer(run) {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cad-feature-api-'));
  const { app } = await createApp({ uploadDir, maxFileSizeBytes: 2_000_000 });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(uploadDir, { recursive: true, force: true });
    clearJobs();
  }
}

async function uploadAndWait(base, filename) {
  const form = new FormData();
  form.append('file', new Blob([await fs.readFile(filename)], { type: 'model/step' }), path.basename(filename));
  const created = await fetch(`${base}/api/cad/import`, { method: 'POST', body: form });
  assert.equal(created.status, 202);
  const id = (await created.json()).job.id;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const job = (await (await fetch(`${base}/api/cad/job/${id}`)).json()).job;
    if (['completed', 'failed'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('job timeout');
}

test.after(async () => closeCadKernel());

test('features API lists recognized geometry and confirm/reject/reset immediately recalculate area', async () => withServer(async (base) => {
  const job = await uploadAndWait(base, 'test-models/features/open_internal_cavity.step');
  const initial = await (await fetch(`${base}/api/cad/report/${job.id}/features`)).json();
  assert.equal(initial.features.length, 1);
  assert.equal(initial.features[0].featureType, 'open_internal_cavity');
  assert.equal(initial.features[0].status, 'review_required');
  const id = initial.features[0].featureId;
  const total = initial.summary.totalAreaMm2;

  const confirmed = await (await fetch(`${base}/api/cad/report/${job.id}/features/${id}/confirm`, { method: 'POST' })).json();
  assert.equal(confirmed.features[0].status, 'manually_confirmed');
  assert.ok(confirmed.summary.paintableAreaMm2 < total);

  const rejected = await (await fetch(`${base}/api/cad/report/${job.id}/features/${id}/reject`, { method: 'POST' })).json();
  assert.equal(rejected.features[0].status, 'manually_rejected');
  assert.equal(rejected.summary.paintableAreaMm2, total);

  const reset = await (await fetch(`${base}/api/cad/report/${job.id}/features/${id}/reset`, { method: 'POST' })).json();
  assert.equal(reset.features[0].status, 'review_required');
  assert.equal(reset.features[0].manualDecision, null);
  assert.equal(reset.summary.paintableAreaMm2, total);
}));

test('per-job rule update reclassifies existing features without a new STEP upload', async () => withServer(async (base) => {
  const job = await uploadAndWait(base, 'test-models/features/through_hole.step');
  const initial = await (await fetch(`${base}/api/cad/report/${job.id}/features`)).json();
  const featureId = initial.features[0].featureId;
  assert.equal(initial.features[0].status, 'confirmed');

  const changedResponse = await fetch(`${base}/api/cad/report/${job.id}/feature-rules`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ holeMinDiameterMm: 9 }),
  });
  assert.equal(changedResponse.status, 200);
  const changed = await changedResponse.json();
  assert.equal(changed.result.features[0].featureId, featureId);
  assert.equal(changed.result.features[0].status, 'rejected');
  assert.equal(changed.result.summary.paintableAreaMm2, changed.result.summary.totalAreaMm2);

  const currentRules = await (await fetch(`${base}/api/cad/report/${job.id}/feature-rules`)).json();
  assert.equal(currentRules.rules.holeMinDiameterMm, 9);

  const invalid = await fetch(`${base}/api/cad/report/${job.id}/feature-rules`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ holeMinDiameterMm: 20, holeMaxDiameterMm: 10 }),
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INVALID_FEATURE_RULES');
}));

test('manual feature validates face IDs, creates an exclusion and can be deleted', async () => withServer(async (base) => {
  const job = await uploadAndWait(base, 'test-models/features/no_features.step');
  const faceId = job.diagnostics.faces[0].id;
  const empty = await fetch(`${base}/api/cad/report/${job.id}/features/manual`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ faceIds: [] }),
  });
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).error.code, 'INVALID_FACE_SELECTION');

  const unknown = await fetch(`${base}/api/cad/report/${job.id}/features/manual`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ faceIds: ['face_missing'] }),
  });
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error.code, 'INVALID_FACE_SELECTION');

  const createdResponse = await fetch(`${base}/api/cad/report/${job.id}/features/manual`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ faceIds: [faceId] }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  const manual = created.features.find((feature) => feature.featureType === 'manual_feature');
  assert.equal(manual.status, 'manually_confirmed');
  assert.equal(manual.faceIds[0], faceId);
  assert.ok(created.summary.confirmedManualExcludedAreaMm2 > 0);

  const duplicate = await fetch(`${base}/api/cad/report/${job.id}/features/manual`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ faceIds: [faceId] }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, 'MANUAL_FEATURE_CONFLICT');

  const removed = await (await fetch(
    `${base}/api/cad/report/${job.id}/features/${manual.featureId}`,
    { method: 'DELETE' },
  )).json();
  assert.equal(removed.features.length, 0);
  assert.equal(removed.summary.confirmedManualExcludedAreaMm2, 0);
}));

test('feature API returns unified errors for incomplete jobs and unknown feature IDs', async () => withServer(async (base) => {
  const form = new FormData();
  form.append('file', new Blob([await fs.readFile('test-models/features/through_hole.step')]), 'through.step');
  const created = await fetch(`${base}/api/cad/import`, { method: 'POST', body: form });
  const queuedId = (await created.json()).job.id;
  const early = await fetch(`${base}/api/cad/report/${queuedId}/features`);
  assert.equal(early.status, 409);
  assert.equal((await early.json()).error.code, 'JOB_NOT_COMPLETED');

  const job = await uploadAndWait(base, 'test-models/features/through_hole.step');
  const missing = await fetch(`${base}/api/cad/report/${job.id}/features/missing/reject`, { method: 'POST' });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'FEATURE_NOT_FOUND');
}));

test('manual exclusion overlapping an automatic feature is deduplicated in the final union', async () => withServer(async (base) => {
  const job = await uploadAndWait(base, 'test-models/features/through_hole.step');
  const initial = await (await fetch(`${base}/api/cad/report/${job.id}/features`)).json();
  const sideFaceId = initial.features[0].sideFaceIds[0];
  const created = await (await fetch(`${base}/api/cad/report/${job.id}/features/manual`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ faceIds: [sideFaceId, job.diagnostics.faces.find((face) => face.id !== sideFaceId).id] }),
  })).json();
  assert.ok(created.summary.overlapAreaMm2 > 0);
  assert.ok(created.summary.uniqueConfirmedExcludedAreaMm2 < created.summary.rawExcludedAreaMm2);
  assert.ok(created.summary.paintableAreaMm2 >= 0);
}));
