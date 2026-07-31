import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { clearJobs } from '../server/jobs.js';
import { closeCadKernel } from '../server/cad/kernel.js';

async function withServer(run, overrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cad-api-'));
  const { app, calculationRepository } = await createApp({ uploadDir: dir, calculationStoragePath: path.join(dir, 'storage'), databasePath: path.join(dir, 'storage', 'test.sqlite'), maxFileSizeBytes: 500_000, ...overrides });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`, dir);
  } finally {
    calculationRepository.close();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
    clearJobs();
  }
}

async function upload(base, filePath, name = path.basename(filePath), mimeType = 'application/octet-stream') {
  const form = new FormData();
  form.append('file', new Blob([await fs.readFile(filePath)], { type: mimeType }), name);
  const response = await fetch(`${base}/api/cad/import`, { method: 'POST', body: form });
  return { response, body: await response.json() };
}

async function waitForTerminal(base, id) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${base}/api/cad/job/${id}`);
    const body = await response.json();
    if (body.job.status === 'completed' || body.job.status === 'failed') return body.job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('CAD job did not complete');
}

test.after(async () => {
  await closeCadKernel();
});

test('POST /api/cad/import accepts .stp and .step and exposes status and report', async () => withServer(async (base, dir) => {
  for (const file of ['test-models/cube_10mm.stp', 'test-models/cube_10mm.step']) {
    const { response, body } = await upload(base, file, path.basename(file), 'model/step');
    assert.equal(response.status, 202);
    assert.equal(body.job.status, 'queued');
    assert.equal(body.job.storedName, undefined);

    const job = await waitForTerminal(base, body.job.id);
    assert.equal(job.status, 'completed', JSON.stringify(job.error));
    assert.equal(job.area.mm2, 600);
    assert.equal(job.diagnostics.counts.faces, 6);

    const reportResponse = await fetch(`${base}/api/cad/report/${job.id}`);
    assert.equal(reportResponse.status, 200);
    const report = (await reportResponse.json()).report;
    assert.equal(report.area.m2, 0.0006);
    assert.equal(report.diagnostics.validation.isValid, true);
  }
  assert.equal((await fs.readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile()).length, 2);
}));

test('corrupt STEP ends with a unified diagnostic error', async () => withServer(async (base) => {
  const { body } = await upload(base, 'test-models/corrupted.step');
  const job = await waitForTerminal(base, body.job.id);
  assert.equal(job.status, 'failed');
  assert.equal(job.error.code, 'INVALID_STEP_FILE');
  assert.equal(job.diagnostics.errors[0].code, 'INVALID_STEP_FILE');
}));

test('empty STEP returns an empty-model diagnostic', async () => withServer(async (base) => {
  const { body } = await upload(base, 'test-models/empty.step');
  const job = await waitForTerminal(base, body.job.id);
  assert.equal(job.status, 'failed');
  assert.equal(job.error.code, 'EMPTY_MODEL');
}));

test('rejects native CAD and arbitrary extensions with unified errors', async () => withServer(async (base) => {
  for (const name of ['part.sldprt', 'assembly.sldasm', 'notes.txt']) {
    const form = new FormData();
    form.append('file', new Blob(['not step']), name);
    const response = await fetch(`${base}/api/cad/import`, { method: 'POST', body: form });
    assert.equal(response.status, 415);
    const body = await response.json();
    assert.equal(body.error.code, 'UNSUPPORTED_FILE_TYPE');
    assert.match(body.error.message, /STEP/);
  }
}));

test('rejects invalid MIME, empty and oversized uploads with unified errors', async () => withServer(async (base) => {
  const cases = [
    ['bad.step', 'ISO-10303-21;', 'image/png', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['empty.stp', '', 'application/octet-stream', 400, 'EMPTY_FILE'],
    ['large.stp', '12345678901234567', 'application/octet-stream', 413, 'FILE_TOO_LARGE'],
  ];
  for (const [name, data, mimeType, status, code] of cases) {
    const form = new FormData();
    form.append('file', new Blob([data], { type: mimeType }), name);
    const response = await fetch(`${base}/api/cad/import`, { method: 'POST', body: form });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.ok(body.error.requestId);
  }
}, { maxFileSizeBytes: 16 }));

test('same STEP uploaded twice returns stable, unique face IDs', async () => withServer(async (base) => {
  const firstUpload = await upload(base, 'test-models/cube_10mm.step');
  const secondUpload = await upload(base, 'test-models/cube_10mm.step');
  const first = await waitForTerminal(base, firstUpload.body.job.id);
  const second = await waitForTerminal(base, secondUpload.body.job.id);
  const firstIds = first.diagnostics.faces.map((face) => face.id);
  const secondIds = second.diagnostics.faces.map((face) => face.id);
  assert.deepEqual(firstIds, secondIds);
  assert.equal(new Set(firstIds).size, firstIds.length);
}));

test('CAD config exposes only STEP', async () => withServer(async (base) => {
  const response = await fetch(`${base}/api/cad/config`);
  const config = await response.json();
  assert.deepEqual(config.allowedExtensions, ['.stp', '.step']);
}));
