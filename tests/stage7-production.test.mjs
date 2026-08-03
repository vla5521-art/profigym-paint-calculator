import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { createWorker } from '../server/worker-runtime.js';
import { configureJobStore, createJob, claimNextJob, getJob, recoverStaleJobs, requestJobCancellation, updateJob } from '../server/jobs.js';
import { closeCadKernel } from '../server/cad/kernel.js';

async function runtime(name) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `profigym-${name}-`));
  return {
    root,
    config: {
      environment: 'test', applicationVersion: '2.0.2', storageRoot: root,
      databaseDir: path.join(root, 'database'), sourceFilesDir: path.join(root, 'source-files'), viewerMeshDir: path.join(root, 'viewer-mesh'), previewsDir: path.join(root, 'previews'), reportsDir: path.join(root, 'reports'), backupsDir: path.join(root, 'backups'), tempDir: path.join(root, 'tmp'),
      uploadDir: path.join(root, 'source-files', 'incoming'), calculationStoragePath: root, databasePath: path.join(root, 'database', 'db.sqlite'),
      processingMode: 'queue', workerRequired: true, workerConcurrency: 1, queuePollIntervalMs: 25, jobHeartbeatIntervalMs: 50, jobStaleAfterMs: 150, jobMaxAttempts: 2, jobTimeoutMs: 60_000,
      accessToken: '', metricsToken: '', logFormat: 'json', logLevel: 'error', logRedactFields: [], frontendDistPath: path.join(root, 'dist'),
    },
  };
}

test('durable queue atomically claims once, cancels and recovers stale jobs', async () => {
  const env = await runtime('queue'); await fs.mkdir(path.dirname(env.config.databasePath), { recursive: true });
  const store = configureJobStore(env.config.databasePath);
  try {
    const first = createJob({ originalName: 'a.step', storedName: 'a.step', size: 10, extension: '.step', correlationId: 'corr-a', maxAttempts: 2 });
    const claimed = claimNextJob('worker-a', { timeoutMs: 1000 });
    assert.equal(claimed.id, first.id); assert.equal(claimed.attempt, 1); assert.equal(claimNextJob('worker-b'), null);
    updateJob(first.id, { heartbeatAt: new Date(Date.now() - 10_000).toISOString() });
    assert.equal(recoverStaleJobs(100, 2), 1); assert.equal(getJob(first.id).status, 'queued');
    const second = createJob({ originalName: 'b.step', storedName: 'b.step', size: 10, extension: '.step', correlationId: 'corr-b' });
    assert.equal(requestJobCancellation(second.id).status, 'cancelled');
  } finally { store.close(); await fs.rm(env.root, { recursive: true, force: true }); }
});

test('stopped worker makes readiness fail, then queued real STEP completes after worker starts', async () => {
  const env = await runtime('worker');
  const created = await createApp(env.config); const server = created.app.listen(0); await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let worker;
  try {
    assert.equal((await fetch(`${base}/health/ready`)).status, 503);
    const bytes = await fs.readFile('test-models/features/through_hole.step'); const form = new FormData(); form.append('file', new Blob([bytes], { type: 'model/step' }), 'through_hole.step');
    const upload = await fetch(`${base}/api/cad/import`, { method: 'POST', body: form }); assert.equal(upload.status, 202); const id = (await upload.json()).job.id;
    await new Promise((resolve) => setTimeout(resolve, 100)); assert.equal(getJob(id).status, 'queued');
    worker = createWorker(env.config).start();
    const deadline = Date.now() + 60_000; let job;
    while (Date.now() < deadline) { job = getJob(id); if (job?.status === 'completed') break; await new Promise((resolve) => setTimeout(resolve, 50)); }
    assert.equal(job?.status, 'completed'); assert.ok(job.area.mm2 > 0);
    assert.equal((await fetch(`${base}/health/ready`)).status, 200);
  } finally {
    if (worker) await worker.stop();
    created.calculationRepository.close();
    await new Promise((resolve) => server.close(resolve));
    await closeCadKernel();
    await fs.rm(env.root, { recursive: true, force: true });
  }
});

test('production auth, rate limit, request ID, CORS and security headers are enforced', async () => {
  const env = await runtime('security');
  const token = 'a-production-token-long-enough-for-testing';
  const created = await createApp({ ...env.config, accessToken: token, metricsToken: `${token}-metrics`, allowedOrigins: ['https://allowed.example'], rateLimits: { login: { limit: 1, windowMs: 60_000 }, upload: { limit: 10, windowMs: 60_000 }, read: { limit: 50, windowMs: 60_000 }, write: { limit: 50, windowMs: 60_000 }, report: { limit: 50, windowMs: 60_000 }, recalculate: { limit: 10, windowMs: 60_000 } } });
  const server = created.app.listen(0); await new Promise((resolve) => server.once('listening', resolve)); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const anonymous = await fetch(`${base}/api/cad/config`); assert.equal(anonymous.status, 401); assert.ok(anonymous.headers.get('content-security-policy')); assert.ok(anonymous.headers.get('x-request-id'));
    const authorized = await fetch(`${base}/api/cad/config`, { headers: { authorization: `Bearer ${token}`, 'x-request-id': 'safe-request-1' } }); assert.equal(authorized.status, 200); assert.equal(authorized.headers.get('x-request-id'), 'safe-request-1');
    const replaced = await fetch(`${base}/health/live`, { headers: { 'x-request-id': 'x'.repeat(1000) } }); assert.notEqual(replaced.headers.get('x-request-id'), 'x'.repeat(1000));
    const deniedCors = await fetch(`${base}/api/cad/config`, { method: 'OPTIONS', headers: { origin: 'https://denied.example' } }); assert.equal(deniedCors.status, 403);
    const badLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'wrong' }) }); assert.equal(badLogin.status, 401);
    const limitedLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) }); assert.equal(limitedLogin.status, 429); assert.ok(limitedLogin.headers.get('retry-after'));
    const metricsAnonymous = await fetch(`${base}/metrics`); assert.equal(metricsAnonymous.status, 401);
    const metrics = await fetch(`${base}/metrics`, { headers: { authorization: `Bearer ${token}-metrics` } }); assert.equal(metrics.status, 200); assert.match(await metrics.text(), /profigym_info\{version="2\.0\.2"/);
  } finally { created.calculationRepository.close(); created.jobStore.close(); await new Promise((resolve) => server.close(resolve)); await fs.rm(env.root, { recursive: true, force: true }); }
});
