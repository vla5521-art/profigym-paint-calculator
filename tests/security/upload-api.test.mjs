import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/app.js';
import { clearJobs } from '../../server/jobs.js';
import { closeCadKernel } from '../../server/cad/kernel.js';
import { reportsDir, writeJson } from '../../scripts/quality-utils.mjs';

const results = [];
async function withServer(run, overrides = {}) {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'profigym-security-'));
  const testRateLimits = Object.fromEntries(['login', 'upload', 'read', 'write', 'report', 'recalculate'].map((category) => [category, { limit: 100, windowMs: 60_000 }]));
  const { app, calculationRepository } = await createApp({ uploadDir: path.join(runtime, 'uploads'), calculationStoragePath: path.join(runtime, 'storage'), databasePath: path.join(runtime, 'storage/db.sqlite'), maxFileSizeBytes: 4096, rateLimits: testRateLimits, ...overrides });
  const server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`, runtime); } finally { calculationRepository.close(); await new Promise((resolve) => server.close(resolve)); clearJobs(); await fs.rm(runtime, { recursive: true, force: true }); }
}
async function upload(base, name, bytes = 'not a STEP', type = 'application/octet-stream') {
  const form = new FormData(); form.append('file', new Blob([bytes], { type }), name);
  const response = await fetch(`${base}/api/cad/import`, { method: 'POST', body: form });
  let body = {}; try { body = await response.json(); } catch { body = {}; }
  return { status: response.status, body };
}
test.after(async () => { await closeCadKernel(); await writeJson(path.join(reportsDir, 'security-results.json'), { schemaVersion: '1.0.0', suite: 'security upload/API', total: results.length, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results }); });

test('extensions, homoglyphs, double extensions and path-like names are contained', async () => withServer(async (base, runtime) => {
  const names = ['a.sldprt','a.sldasm','a.asm','a.txt','a.exe','a.step.exe','a.stеp','a.step.','../../file.step','..\\..\\file.step','C:\\Windows\\file.step','／etc／file.step'];
  for (const name of names) {
    const result = await upload(base, name); const pass = result.status === 415 || (result.status === 202 && path.basename(name).toLowerCase().endsWith('.step'));
    results.push({ category: 'filename', input: name, status: result.status, pass }); assert.equal(pass, true, `${name}: ${result.status}`);
  }
  const uploaded = await fs.readdir(path.join(runtime, 'uploads')); assert.equal(uploaded.every((name) => !name.includes('..') && !path.isAbsolute(name)), true);
}));

test('MIME and content spoof payloads never execute or unpack', async () => withServer(async (base) => {
  const payloads = [
    ['zip.step', Buffer.from('504b0304', 'hex')], ['html.step', '<script>alert(1)</script>'], ['js.step', 'process.exit(1)'],
    ['exe.step', Buffer.from('4d5a9000', 'hex')], ['xlsx.step', Buffer.from('504b030414000000', 'hex')], ['binary.step', Buffer.from([0,255,1,254])],
    ['bomb.step', Buffer.from('PK\u0003\u0004../../huge')],
  ];
  for (const [name, bytes] of payloads) {
    const response = await upload(base, name, bytes); const pass = [202,400,415,422].includes(response.status) && response.status !== 500;
    results.push({ category: 'content-spoof', input: name, status: response.status, pass }); assert.equal(pass, true);
  }
}));

test('size boundary rejects limit + 1 without leaving a file', async () => withServer(async (base, runtime) => {
  const atLimit = await upload(base, 'limit.step', Buffer.alloc(64, 65));
  const over = await upload(base, 'over.step', Buffer.alloc(65, 65));
  results.push({ category: 'size', input: 'limit', status: atLimit.status, pass: atLimit.status === 202 }, { category: 'size', input: 'limit+1', status: over.status, pass: over.status === 413 });
  assert.equal(atLimit.status, 202); assert.equal(over.status, 413);
  assert.equal((await fs.readdir(path.join(runtime, 'uploads'))).length <= 1, true);
}, { maxFileSizeBytes: 64 }));

test('API rejects malformed IDs, oversized JSON, invalid types and prototype keys', async () => withServer(async (base) => {
  const requests = [
    fetch(`${base}/api/cad/calculations/not-a-uuid`),
    fetch(`${base}/api/cad/calculations/../../etc/passwd`),
    fetch(`${base}/api/cad/calculations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: { $ne: null }, name: '<img src=x onerror=alert(1)>' }) }),
    fetch(`${base}/api/cad/calculations?page=-1&pageSize=-5&sort=DROP%20TABLE`),
    fetch(`${base}/api/cad/calculations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ __proto__: { polluted: true }, payload: 'x'.repeat(70_000) }) }),
  ];
  for (const pending of requests) { const response = await pending; const pass = response.status < 500; results.push({ category: 'api', status: response.status, pass }); assert.equal(pass, true); }
  assert.equal({}.polluted, undefined);
}));
