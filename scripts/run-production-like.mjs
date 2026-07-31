import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'profigym-production-like-'));
const logFile = path.join(runtime, 'services.jsonl');
const port = 8899;
const token = 'stage7-local-smoke-token-with-at-least-32-bytes';
const env = {
  ...process.env,
  NODE_ENV: 'production',
  CAD_API_PORT: String(port),
  APP_PUBLIC_URL: `http://127.0.0.1:${port}`,
  APP_ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
  PROFIGYM_ACCESS_TOKEN: token,
  PROFIGYM_METRICS_TOKEN: `${token}-metrics`,
  CAD_STORAGE_ROOT: runtime,
  CAD_DATABASE_PATH: path.join(runtime, 'database', 'profigym.sqlite'),
  CAD_TEMP_DIR: path.join(runtime, 'tmp'),
  CAD_FRONTEND_DIST_PATH: path.resolve('dist'),
  CAD_PROCESSING_MODE: 'queue',
  CAD_WORKER_REQUIRED: 'true',
  CAD_WORKER_CONCURRENCY: '1',
  CAD_QUEUE_POLL_INTERVAL_MS: '100',
  CAD_JOB_HEARTBEAT_INTERVAL_MS: '250',
  CAD_JOB_STALE_AFTER_MS: '1500',
  LOG_FORMAT: 'json',
  PROFIGYM_LOG_FILE: logFile,
};
const children = new Set();
function service(args) {
  const child = spawn(process.execPath, args, { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { void fs.appendFile(logFile, chunk); process.stdout.write(chunk); });
  child.on('exit', () => children.delete(child));
  return child;
}
async function waitForReady(expected, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { const response = await fetch(`${env.APP_PUBLIC_URL}/health/ready`); if (response.status === expected) return; } catch { /* service is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Readiness did not become ${expected}`);
}
async function run(script) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: process.cwd(), env, stdio: 'inherit' });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)));
  });
}
let worker;
try {
  service(['server/index.js']);
  worker = service(['server/worker.js']);
  await waitForReady(200);
  await run('scripts/production-smoke.mjs');
  worker.kill('SIGTERM');
  await new Promise((resolve) => worker.once('exit', resolve));
  await waitForReady(503, 10_000);
  worker = service(['server/worker.js']);
  await waitForReady(200);
  await run('scripts/observability-smoke.mjs');
  await run('scripts/backup-smoke.mjs');
  await run('scripts/rollback-smoke.mjs');
  const result = {
    status: 'PASS',
    generatedAt: new Date().toISOString(),
    orchestration: 'local-separate-processes',
    localUrl: env.APP_PUBLIC_URL,
    localUrlIsProduction: false,
    apiProcess: 'PASS',
    workerProcess: 'PASS',
    workerDownReadinessStatus: 503,
    workerRestartReadinessStatus: 200,
  };
  await fs.mkdir(path.resolve('diagnostic-reports'), { recursive: true });
  await fs.writeFile(path.resolve('diagnostic-reports/production-like-orchestration.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...result, runtime }));
} finally {
  for (const child of children) child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await fs.rm(runtime, { recursive: true, force: true });
}
