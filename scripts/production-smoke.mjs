import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.env.APP_PUBLIC_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const token = process.env.PROFIGYM_ACCESS_TOKEN || '';
const metricsToken = process.env.PROFIGYM_METRICS_TOKEN || token;
const headers = token ? { authorization: `Bearer ${token}` } : {};
const results = [];
const check = (id, pass, details = {}) => { results.push({ id, pass: Boolean(pass), ...details }); if (!pass) throw new Error(`Production smoke failed: ${id}`); };
async function request(url, options = {}, expected = 200) {
  const response = await fetch(`${base}${url}`, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  check(`http:${url}:${expected}`, response.status === expected, { actual: response.status });
  return response;
}
async function upload(name, bytes, mime = 'model/step') {
  const form = new FormData(); form.append('file', new Blob([bytes], { type: mime }), name);
  const response = await request('/api/cad/import', { method: 'POST', body: form }, 202);
  return (await response.json()).job;
}
async function terminal(id, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const response = await request(`/api/cad/job/${id}`);
    const body = await response.json();
    if (['completed', 'failed', 'cancelled', 'timed_out'].includes(body.job.status)) return body.job;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Job ${id} did not finish`);
}

const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(base);
check('https', base.startsWith('https://') || local, { mode: base.startsWith('https://') ? 'https' : 'local-http-exception' });
const live = await fetch(`${base}/health/live`); check('liveness', live.ok);
const ready = await fetch(`${base}/health/ready`); check('readiness', ready.ok, { status: ready.status });
const rootResponse = await fetch(`${base}/`, { redirect: 'manual' });
for (const header of ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy', 'cross-origin-resource-policy']) check(`security-header:${header}`, Boolean(rootResponse.headers.get(header)));
if (token) { const unauthorized = await fetch(`${base}/api/cad/config`); check('auth-rejects-anonymous', unauthorized.status === 401, { status: unauthorized.status }); }
const metrics = await fetch(`${base}/metrics`, { headers: metricsToken ? { authorization: `Bearer ${metricsToken}` } : {} });
check('metrics-access-policy', metrics.ok, { status: metrics.status });
const metricsText = await metrics.text(); check('metrics-required-series', ['http_requests_total', 'cad_jobs_queued', 'cad_worker_heartbeat_age_seconds', 'process_resident_memory_bytes'].every((name) => metricsText.includes(name)));

const step = await fs.readFile(path.join(root, 'test-models/features/through_hole.step'));
const queued = await upload('through_hole.step', step);
check('queue-created', queued.status === 'queued' || queued.status === 'processing');
const completed = await terminal(queued.id);
check('worker-processing', completed.status === 'completed', { status: completed.status, errorCode: completed.errorCode });
check('total-area', completed.area?.mm2 > 0, { areaMm2: completed.area?.mm2 });
check('feature-exclusion', completed.featureSummary?.uniqueConfirmedExcludedAreaMm2 > 0, { excludedMm2: completed.featureSummary?.uniqueConfirmedExcludedAreaMm2 });
const savedResponse = await request('/api/cad/calculations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: queued.id, name: 'Stage 7 production smoke' }) }, 201);
const saved = (await savedResponse.json()).calculation;
check('calculation-saved', Boolean(saved.calculationId));
const calculationId = saved.calculationId;
const reopened = await request(`/api/cad/calculations/${calculationId}`); check('calculation-reopened', (await reopened.json()).calculation.calculationId === calculationId);
const mesh = await request(`/api/cad/calculations/${calculationId}/viewer-mesh`); check('viewer-mesh', (await mesh.json()).mesh.available === true);
const jsonReport = await request(`/api/cad/calculations/${calculationId}/report.json`); const json = await jsonReport.json(); check('json-report', JSON.stringify(json).includes(calculationId));
const htmlReport = await request(`/api/cad/calculations/${calculationId}/report.html`); const html = await htmlReport.text(); check('html-report', html.includes(calculationId) && /PROFiGYM/.test(html));
const integration = await request(`/api/cad/calculations/${calculationId}/integrate-paint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: true }) });
check('cad-to-paint', Number((await integration.json()).integration.paintableAreaM2) > 0);
await request(`/api/cad/calculations/${calculationId}`, { method: 'DELETE' }, 204);
const deleted = await fetch(`${base}/api/cad/calculations/${calculationId}`, { headers }); check('calculation-deleted', deleted.status === 404, { status: deleted.status });

const unsupported = new FormData(); unsupported.append('file', new Blob(['native cad'], { type: 'application/octet-stream' }), 'part.sldprt');
const unsupportedResponse = await fetch(`${base}/api/cad/import`, { method: 'POST', headers, body: unsupported }); check('unsupported-format-415', unsupportedResponse.status === 415, { status: unsupportedResponse.status });
const corrupted = await upload('corrupted.step', Buffer.from('ISO-10303-21;\nBROKEN\nEND-ISO-10303-21;'));
const corruptResult = await terminal(corrupted.id); check('corrupt-step-controlled', corruptResult.status === 'failed' && Boolean(corruptResult.error?.code || corruptResult.errorCode), { status: corruptResult.status, errorCode: corruptResult.error?.code || corruptResult.errorCode });
await fs.mkdir(path.join(root, 'diagnostic-reports'), { recursive: true });
const report = { applicationVersion: '2.1.1', generatedAt: new Date().toISOString(), baseUrl: base, https: base.startsWith('https://'), localHttpException: local && !base.startsWith('https://'), transport: 'HTTP_ONLY', status: results.every((item) => item.pass) ? 'PASS' : 'FAIL', tests: results.length, results };
await fs.writeFile(path.join(root, 'diagnostic-reports', 'production-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
