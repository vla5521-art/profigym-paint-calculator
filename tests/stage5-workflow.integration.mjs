import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { analyzeStepContent } from '../server/cad/kernel.js';
import { migrateDatabase } from '../server/cad/calculations/migrations.js';
import { CalculationRepository, sanitizeCalculationName } from '../server/cad/calculations/repository.js';
import { viewerInternals } from '../server/cad/viewer/service.js';

const model = (name) => path.resolve('test-models/features', name);

async function apiEnvironment() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'profigym-stage5-'));
  const uploadDir = path.join(root, 'uploads');
  const calculationStoragePath = path.join(root, 'calculations');
  const databasePath = path.join(root, 'database.sqlite');
  const created = await createApp({ uploadDir, calculationStoragePath, databasePath });
  const server = created.app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    ...created,
    root,
    baseUrl,
    async close({ keep = false } = {}) {
      await new Promise((resolve) => server.close(resolve));
      created.calculationRepository.close();
      if (!keep) await fs.rm(root, { recursive: true, force: true });
    },
  };
}

async function requestJson(baseUrl, url, options) {
  const response = await fetch(`${baseUrl}${url}`, options);
  const payload = response.status === 204 ? null : await response.json();
  return { response, payload };
}

async function uploadAndWait(environment, filename) {
  const bytes = await fs.readFile(model(filename));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/step' }), filename);
  const created = await requestJson(environment.baseUrl, '/api/cad/import', { method: 'POST', body: form });
  assert.equal(created.response.status, 202);
  const id = created.payload.job.id;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await requestJson(environment.baseUrl, `/api/cad/job/${id}`);
    if (state.payload.job.status === 'completed') return state.payload.job;
    if (state.payload.job.status === 'failed') assert.fail(state.payload.job.error?.message);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('CAD job timeout');
}

test('real B-Rep tessellation preserves face IDs, valid normals and browser-safe payload', async () => {
  const source = await fs.readFile(model('through_hole.step'), 'utf8');
  const result = await analyzeStepContent(source, 'through_hole.step');
  assert.equal(result.ok, true);
  assert.equal(result.viewerMesh.available, true);
  assert.equal(result.viewerMesh.faces.length, result.diagnostics.counts.faces);
  const ids = new Set(result.diagnostics.faces.map((face) => face.id));
  for (const face of result.viewerMesh.faces) {
    assert.ok(ids.has(face.faceId));
    assert.equal(face.positions.length, face.normals.length);
    assert.equal(face.indices.length % 3, 0);
    assert.ok(face.normals.every(Number.isFinite));
  }
  assert.doesNotMatch(JSON.stringify(result.viewerMesh), /patchBrep|excludedFaceIds|ISO-10303-21/);
});

test('partial contact is represented by an exact patch mesh without repainting the whole face', async () => {
  const source = await fs.readFile(path.resolve('test-models/contacts/two_plates_partial_overlap.step'), 'utf8');
  const result = await analyzeStepContent(source, 'two_plates_partial_overlap.step');
  const partial = result.contactResult.contacts.find((contact) => contact.contactType === 'partial_planar_contact');
  assert.ok(partial);
  const patch = result.viewerMesh.patches.find((item) => item.sourceContactIds.includes(partial.contactId));
  assert.ok(patch);
  assert.equal(patch.areaMm2, partial.contactAreaMm2);
  assert.ok(patch.indices.length >= 3);
  const affected = result.viewerMesh.faces.filter((face) => [partial.faceAId, partial.faceBId].includes(face.faceId));
  assert.ok(affected.every((face) => face.category === 'painted'));
});

test('triangle limit is handled by controlled unavailable-mesh result', async () => {
  const source = await fs.readFile(model('through_hole.step'), 'utf8');
  const result = await analyzeStepContent(source, 'through_hole.step', { viewerConfig: { linearDeflectionMm: 0.01, angularDeflectionDeg: 5, maxTriangles: 1 } });
  assert.equal(result.ok, true);
  assert.equal(result.viewerMesh.available, false);
  assert.equal(result.viewerMesh.warning.code, 'VIEWER_MESH_TOO_LARGE');
});

test('SQLite migration is idempotent and uses persistent schema version', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'profigym-db-'));
  const databasePath = path.join(root, 'calculation.sqlite');
  const first = migrateDatabase(databasePath);
  assert.deepEqual(first.prepare('SELECT version FROM schema_migrations').all().map((row) => Number(row.version)), [1, 2]);
  first.close();
  const second = migrateDatabase(databasePath);
  assert.equal(Number(second.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count), 2);
  second.close();
  await fs.rm(root, { recursive: true, force: true });
});

test('E2E scenario: through hole → viewer → save → report → confirmed CAD-to-paint transfer', async () => {
  const environment = await apiEnvironment();
  try {
    const job = await uploadAndWait(environment, 'through_hole.step');
    const mesh = await requestJson(environment.baseUrl, `/api/cad/report/${job.id}/viewer-mesh`);
    assert.equal(mesh.response.status, 200);
    assert.ok(mesh.payload.mesh.faces.some((face) => face.category === 'hole_excluded'));
    const saved = await requestJson(environment.baseUrl, '/api/cad/calculations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: job.id, name: 'Сквозное отверстие' }) });
    assert.equal(saved.response.status, 201);
    const calculation = saved.payload.calculation;
    const report = await requestJson(environment.baseUrl, `/api/cad/calculations/${calculation.calculationId}/report.json`);
    assert.equal(report.response.status, 200);
    assert.equal(report.payload.summary.paintableAreaMm2, calculation.featureSummary.paintableAreaMm2);
    const unconfirmed = await requestJson(environment.baseUrl, `/api/cad/calculations/${calculation.calculationId}/integrate-paint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(unconfirmed.response.status, 409);
    const integration = await requestJson(environment.baseUrl, `/api/cad/calculations/${calculation.calculationId}/integrate-paint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: true }) });
    assert.equal(integration.payload.integration.paintableAreaM2, calculation.featureSummary.paintableAreaMm2 / 1_000_000);
    assert.equal(integration.payload.integration.source, 'cad_calculation');

    const reportWithoutPreview = await fetch(`${environment.baseUrl}/api/cad/calculations/${calculation.calculationId}/report.html`).then((response) => response.text());
    assert.match(reportWithoutPreview, /Изображение модели: не приложено/);
    const invalidPreview = new FormData();
    invalidPreview.append('preview', new Blob(['not-an-image'], { type: 'text/plain' }), 'preview.txt');
    const rejectedPreview = await requestJson(environment.baseUrl, `/api/cad/calculations/${calculation.calculationId}/preview`, { method: 'POST', body: invalidPreview });
    assert.equal(rejectedPreview.response.status, 400);
    assert.equal(rejectedPreview.payload.error.code, 'INVALID_REPORT_PREVIEW');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const validPreview = new FormData();
    validPreview.append('preview', new Blob([png], { type: 'image/png' }), 'preview.png');
    const acceptedPreview = await requestJson(environment.baseUrl, `/api/cad/calculations/${calculation.calculationId}/preview`, { method: 'POST', body: validPreview });
    assert.equal(acceptedPreview.response.status, 201);
    assert.equal(acceptedPreview.payload.preview.mime, 'image/png');
    const reportWithPreview = await fetch(`${environment.baseUrl}/api/cad/calculations/${calculation.calculationId}/report.html`).then((response) => response.text());
    assert.match(reportWithPreview, /data:image\/png;base64/);
    const duplicate = await requestJson(environment.baseUrl, `/api/cad/calculations/${calculation.calculationId}/duplicate`, { method: 'POST' });
    const duplicateRecord = environment.calculationRepository.get(duplicate.payload.calculation.calculationId);
    assert.ok(duplicateRecord.payload.preview.storageRef.startsWith(`previews/${duplicateRecord.id}/`));
    const duplicateReport = await fetch(`${environment.baseUrl}/api/cad/calculations/${duplicateRecord.id}/report.html`).then((response) => response.text());
    assert.match(duplicateReport, /data:image\/png;base64/);
  } finally { await environment.close(); }
});

test('saved calculation list, search, pagination, rename, duplicate, deletion and retention policy work', async () => {
  const environment = await apiEnvironment();
  try {
    const job = await uploadAndWait(environment, 'no_features.step');
    const first = await requestJson(environment.baseUrl, '/api/cad/calculations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: job.id, name: 'Первая деталь' }) });
    const second = await requestJson(environment.baseUrl, '/api/cad/calculations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: job.id, name: 'Вторая деталь' }) });
    const page = await requestJson(environment.baseUrl, '/api/cad/calculations?page=1&pageSize=1&search=%D0%B4%D0%B5%D1%82%D0%B0%D0%BB%D1%8C&status=completed&sort=created_asc');
    assert.equal(page.response.status, 200);
    assert.equal(page.payload.total, 2);
    assert.equal(page.payload.items.length, 1);
    const renamed = await requestJson(environment.baseUrl, `/api/cad/calculations/${first.payload.calculation.calculationId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '<b>Безопасное имя</b>' }) });
    assert.equal(renamed.payload.calculation.name, '<b>Безопасное имя</b>');
    const reportHtml = await fetch(`${environment.baseUrl}/api/cad/calculations/${first.payload.calculation.calculationId}/report.html`).then((response) => response.text());
    assert.match(reportHtml, /&lt;b&gt;Безопасное имя&lt;\/b&gt;/);
    const duplicate = await requestJson(environment.baseUrl, `/api/cad/calculations/${second.payload.calculation.calculationId}/duplicate`, { method: 'POST' });
    assert.equal(duplicate.response.status, 201);
    const duplicateRecord = environment.calculationRepository.get(duplicate.payload.calculation.calculationId);
    const duplicateDirectories = ['source-files', 'viewer-mesh'].map((name) => environment.calculationRepository.resolveStorageRef(`${name}/${duplicateRecord.id}`));
    for (const directory of duplicateDirectories) await fs.access(directory);
    const deleted = await requestJson(environment.baseUrl, `/api/cad/calculations/${duplicateRecord.id}`, { method: 'DELETE' });
    assert.equal(deleted.response.status, 204);
    for (const directory of duplicateDirectories) await assert.rejects(fs.access(directory));
    const deletedAgain = await requestJson(environment.baseUrl, `/api/cad/calculations/${duplicateRecord.id}`, { method: 'DELETE' });
    assert.equal(deletedAgain.response.status, 404);

    environment.calculationRepository.config.sourceFileRetentionEnabled = false;
    await environment.calculationRepository.cleanupExpiredSources(Date.now() + 1);
    const retained = environment.calculationRepository.get(first.payload.calculation.calculationId);
    assert.equal(retained.payload.sourceRetained, false);
    await assert.rejects(environment.calculationRepository.readSource(retained));
  } finally { await environment.close(); }
});

test('E2E scenario: open cavity decision persists after repository/server restart', async () => {
  const first = await apiEnvironment();
  let calculationId;
  try {
    const job = await uploadAndWait(first, 'open_internal_cavity.step');
    const saved = await requestJson(first.baseUrl, '/api/cad/calculations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: job.id, name: 'Полость' }) });
    calculationId = saved.payload.calculation.calculationId;
    const feature = saved.payload.calculation.features.find((item) => item.status === 'review_required');
    assert.ok(feature);
    const decided = await requestJson(first.baseUrl, `/api/cad/calculations/${calculationId}/decisions/bulk`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityType: 'feature', ids: [feature.featureId], decision: 'confirm' }) });
    assert.equal(decided.payload.calculation.features.find((item) => item.featureId === feature.featureId).status, 'manually_confirmed');
  } finally { await first.close({ keep: true }); }

  const uploadDir = path.join(first.root, 'uploads');
  const calculationStoragePath = path.join(first.root, 'calculations');
  const databasePath = path.join(first.root, 'database.sqlite');
  const restarted = await createApp({ uploadDir, calculationStoragePath, databasePath });
  const server = restarted.app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const reopened = await requestJson(baseUrl, `/api/cad/calculations/${calculationId}`);
    assert.equal(reopened.response.status, 200);
    assert.ok(reopened.payload.calculation.features.some((feature) => feature.status === 'manually_confirmed'));
    const viewer = await requestJson(baseUrl, `/api/cad/calculations/${calculationId}/viewer-mesh`);
    assert.equal(viewer.response.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restarted.calculationRepository.close();
    await fs.rm(first.root, { recursive: true, force: true });
  }
});

test('E2E scenario: contact/feature overlap has one canonical value in API and report', async () => {
  const environment = await apiEnvironment();
  try {
    const job = await uploadAndWait(environment, 'contact_and_hole_overlap.step');
    const saved = await requestJson(environment.baseUrl, '/api/cad/calculations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: job.id, name: 'Перекрытие' }) });
    const calculation = saved.payload.calculation;
    const summary = calculation.featureSummary;
    assert.ok(summary.overlapAreaMm2 > 0);
    assert.ok(Math.abs(summary.rawExcludedAreaMm2 - summary.overlapAreaMm2 - summary.uniqueConfirmedExcludedAreaMm2) < 0.01);
    const report = await requestJson(environment.baseUrl, `/api/cad/calculations/${calculation.calculationId}/report.json`);
    assert.deepEqual(report.payload.summary, summary);
  } finally { await environment.close(); }
});

test('E2E scenario: manual exclusion can be added and removed from a saved calculation', async () => {
  const environment = await apiEnvironment();
  try {
    const job = await uploadAndWait(environment, 'no_features.step');
    const saved = await requestJson(environment.baseUrl, '/api/cad/calculations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: job.id, name: 'Ручная грань' }) });
    const calculation = saved.payload.calculation;
    const faceId = calculation.diagnostics.faces[0].id;
    const added = await requestJson(environment.baseUrl, `/api/cad/calculations/${calculation.calculationId}/features/manual`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ faceIds: [faceId] }) });
    const manual = added.payload.calculation.features.find((feature) => feature.featureType === 'manual_feature');
    assert.ok(manual);
    assert.ok(added.payload.calculation.featureSummary.paintableAreaMm2 < calculation.featureSummary.paintableAreaMm2);
    const removed = await requestJson(environment.baseUrl, `/api/cad/calculations/${calculation.calculationId}/features/${manual.featureId}`, { method: 'DELETE' });
    assert.equal(removed.payload.calculation.featureSummary.paintableAreaMm2, calculation.featureSummary.paintableAreaMm2);
  } finally { await environment.close(); }
});

test('E2E scenario: recalculation creates revision and restores compatible decisions', async () => {
  const environment = await apiEnvironment();
  try {
    const job = await uploadAndWait(environment, 'blind_hole.step');
    const saved = await requestJson(environment.baseUrl, '/api/cad/calculations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: job.id, name: 'Ревизии' }) });
    const id = saved.payload.calculation.calculationId;
    const recalculated = await requestJson(environment.baseUrl, `/api/cad/calculations/${id}/recalculate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ featureRules: { excludeBottomFace: true }, preserveManualDecisions: true, preserveReviewDecisions: true }) });
    assert.equal(recalculated.response.status, 200);
    assert.equal(recalculated.payload.calculation.revisionNumber, 2);
    assert.ok(recalculated.payload.calculation.featureSummary.confirmedHoleExcludedAreaMm2 >= saved.payload.calculation.featureSummary.confirmedHoleExcludedAreaMm2);
    const revisions = await requestJson(environment.baseUrl, `/api/cad/calculations/${id}/revisions`);
    assert.equal(revisions.payload.revisions.length, 2);
  } finally { await environment.close(); }
});

test('storage references reject path traversal and names are safe for React/HTML rendering', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'profigym-security-'));
  const repository = new CalculationRepository({ calculationStoragePath: path.join(root, 'storage'), databasePath: path.join(root, 'db.sqlite') });
  try {
    assert.throws(() => repository.resolveStorageRef('../../etc/passwd'), /Некорректная|пределы/);
    assert.throws(() => repository.resolveOwnedStorageRef({ id: 'owned' }, 'other/source.step'), /не принадлежит/);
    assert.equal(sanitizeCalculationName('<script>alert(1)</script>'), '<script>alert(1)</script>');
    assert.throws(() => sanitizeCalculationName('\u0000'), /Название/);
  } finally { repository.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('viewer group extraction keeps triangle indexing deterministic', () => {
  const mesh = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
  };
  assert.deepEqual(viewerInternals.extractGroup(mesh, 0, 3).indices, [0, 1, 2]);
});
