import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { clearJobs } from '../server/jobs.js';
import { closeCadKernel } from '../server/cad/kernel.js';

async function withServer(run) {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cad-contact-api-'));
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
  const id = (await created.json()).job.id;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = (await (await fetch(`${base}/api/cad/job/${id}`)).json()).job;
    if (['completed', 'failed'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('job timeout');
}

test.after(async () => {
  await closeCadKernel();
});

test('contacts API returns contacts and supports confirm, reject and reset with immediate recalculation', async () => withServer(async (base) => {
  const job = await uploadAndWait(base, 'test-models/contacts/small_gap_below_tolerance.step');
  assert.equal(job.status, 'completed');
  const initialResponse = await fetch(`${base}/api/cad/report/${job.id}/contacts`);
  assert.equal(initialResponse.status, 200);
  const initial = await initialResponse.json();
  assert.equal(initial.contacts.length, 1);
  assert.equal(initial.contacts[0].status, 'review_required');
  assert.equal(initial.summary.paintableAreaMm2, 1040);
  const contactId = initial.contacts[0].contactId;

  const confirmed = await (await fetch(
    `${base}/api/cad/report/${job.id}/contacts/${contactId}/confirm`,
    { method: 'POST' },
  )).json();
  assert.equal(confirmed.contacts[0].status, 'confirmed');
  assert.equal(confirmed.summary.confirmedExcludedPaintAreaMm2, 400);
  assert.equal(confirmed.summary.paintableAreaMm2, 640);

  const rejected = await (await fetch(
    `${base}/api/cad/report/${job.id}/contacts/${contactId}/reject`,
    { method: 'POST' },
  )).json();
  assert.equal(rejected.contacts[0].status, 'rejected');
  assert.equal(rejected.summary.paintableAreaMm2, 1040);

  const reset = await (await fetch(
    `${base}/api/cad/report/${job.id}/contacts/${contactId}/reset`,
    { method: 'POST' },
  )).json();
  assert.equal(reset.contacts[0].status, 'review_required');
  assert.equal(reset.contacts[0].manualDecision, null);
  assert.equal(reset.summary.reviewRequiredPhysicalAreaMm2, 200);
}));

test('unknown contact ID and incomplete job use unified contact error codes', async () => withServer(async (base) => {
  const form = new FormData();
  form.append('file', new Blob([await fs.readFile('test-models/cube_10mm.step')]), 'cube.step');
  const created = await fetch(`${base}/api/cad/import`, { method: 'POST', body: form });
  const queuedId = (await created.json()).job.id;
  const early = await fetch(`${base}/api/cad/report/${queuedId}/contacts`);
  assert.equal(early.status, 409);
  assert.equal((await early.json()).error.code, 'JOB_NOT_COMPLETED');

  const job = await uploadAndWait(base, 'test-models/contacts/two_plates_full_contact.step');
  const missing = await fetch(`${base}/api/cad/report/${job.id}/contacts/missing/reject`, { method: 'POST' });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'CONTACT_NOT_FOUND');
}));
