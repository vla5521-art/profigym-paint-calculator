import fs from 'node:fs/promises';
import path from 'node:path';
import { databaseStatus } from '../cad/calculations/migrations.js';
import { freshestWorkerHeartbeat } from '../jobs.js';

async function writable(directory) {
  const file = path.join(directory, `.health-${process.pid}-${Date.now()}`);
  try { await fs.mkdir(directory, { recursive: true }); await fs.writeFile(file, 'ok'); await fs.rm(file); return true; } catch { return false; }
}

export function createHealth(config) {
  const startedAt = new Date().toISOString();
  const metadata = (status, checks = {}) => ({ status, service: 'profigym-app', applicationVersion: config.applicationVersion, environment: config.environment, startedAt, checks });
  return {
    live: (_req, res) => res.json(metadata('ok', { eventLoop: 'responding' })),
    startup: async (_req, res) => {
      const checks = { configuration: true, database: false, storage: false, frontendAssets: false, occtModule: false };
      try { checks.database = databaseStatus(config.databasePath).integrity === 'ok'; } catch { checks.database = false; }
      checks.storage = await writable(config.databaseDir) && await writable(config.tempDir);
      try { checks.frontendAssets = (await fs.stat(path.join(config.frontendDistPath, 'index.html'))).isFile(); } catch { checks.frontendAssets = config.environment !== 'production'; }
      try { checks.occtModule = Boolean(await import('occt-wasm')); } catch { checks.occtModule = false; }
      const ok = Object.values(checks).every(Boolean);
      res.status(ok ? 200 : 503).json(metadata(ok ? 'ok' : 'not_ready', checks));
    },
    ready: async (_req, res) => {
      const checks = { database: false, migrations: false, storage: false, queue: false, worker: !config.workerRequired, frontendAssets: false };
      try { const status = databaseStatus(config.databasePath); checks.database = status.integrity === 'ok'; checks.migrations = status.schemaVersion >= 2; checks.queue = true; } catch { checks.database = false; }
      checks.storage = await writable(config.databaseDir) && await writable(config.sourceFilesDir);
      try { checks.frontendAssets = (await fs.stat(path.join(config.frontendDistPath, 'index.html'))).isFile(); } catch { checks.frontendAssets = config.environment !== 'production'; }
      const heartbeat = freshestWorkerHeartbeat();
      if (config.workerRequired) checks.worker = Boolean(heartbeat && Date.now() - Date.parse(heartbeat.heartbeatAt) <= config.jobStaleAfterMs);
      const ok = Object.values(checks).every(Boolean);
      res.status(ok ? 200 : 503).json(metadata(ok ? 'ok' : 'not_ready', checks));
    },
  };
}
