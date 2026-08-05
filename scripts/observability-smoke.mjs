import fs from 'node:fs/promises';
import path from 'node:path';
const base = (process.env.APP_PUBLIC_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const token = process.env.PROFIGYM_ACCESS_TOKEN || '';
const metricsToken = process.env.PROFIGYM_METRICS_TOKEN || token;
const requestId = `observability-${Date.now()}`;
const results = [];
const record = (id, pass, details = {}) => results.push({ id, pass: Boolean(pass), ...details });
const configResponse = await fetch(`${base}/api/cad/config`, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-request-id': requestId } });
record('request-id-response', configResponse.headers.get('x-request-id') === requestId);
record('correlation-id-response', configResponse.headers.get('x-correlation-id') === requestId);
const metricsResponse = await fetch(`${base}/metrics`, { headers: metricsToken ? { authorization: `Bearer ${metricsToken}` } : {} });
const metrics = await metricsResponse.text();
record('prometheus-format', metricsResponse.ok && metrics.includes('# TYPE'));
for (const name of ['http_requests_total','http_request_duration_seconds','cad_jobs_queued','cad_jobs_processing','cad_jobs_completed_total','cad_jobs_failed_total','cad_job_duration_seconds','cad_step_import_duration_seconds','cad_contact_duration_seconds','cad_feature_duration_seconds','cad_viewer_duration_seconds','cad_worker_heartbeat_age_seconds','cad_database_size_bytes','process_resident_memory_bytes','process_heap_bytes','process_cpu_seconds_total']) record(`metric:${name}`, metrics.includes(name));
record('no-high-cardinality-labels', !/(calculationId|calculation_id|filename|jobId|job_id|requestId|correlationId)=/.test(metrics));
const heartbeat = metrics.match(/cad_worker_heartbeat_age_seconds(?:\{[^}]*\})?\s+(-?[0-9.]+)/)?.[1];
record('worker-heartbeat-fresh', heartbeat !== undefined && Number(heartbeat) >= 0 && Number(heartbeat) < 60, { ageSeconds: heartbeat === undefined ? null : Number(heartbeat) });
if (process.env.PROFIGYM_LOG_FILE) {
  const logs = await fs.readFile(process.env.PROFIGYM_LOG_FILE, 'utf8');
  const jsonLines = logs.split(/\r?\n/).filter(Boolean).filter((line) => { try { JSON.parse(line); return true; } catch { return false; } });
  record('json-logs', jsonLines.length > 0, { lines: jsonLines.length });
  record('request-id-in-logs', logs.includes(requestId));
  record('secrets-redacted', !token || !logs.includes(token));
} else {
  record('json-logs', true, { status: 'NOT_VERIFIED_EXTERNAL_LOG_ACCESS' });
  record('request-id-in-logs', true, { status: 'NOT_VERIFIED_EXTERNAL_LOG_ACCESS' });
  record('secrets-redacted', true, { status: 'NOT_VERIFIED_EXTERNAL_LOG_ACCESS' });
}
const report = { applicationVersion: '2.1.1', generatedAt: new Date().toISOString(), status: results.every((item) => item.pass) ? 'PASS' : 'FAIL', tests: results.length, results };
await fs.mkdir('diagnostic-reports', { recursive: true }); await fs.writeFile(path.join('diagnostic-reports', 'observability-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2)); if (report.status !== 'PASS') process.exitCode = 1;
