import fs from 'node:fs/promises';
import path from 'node:path';
import { deleteJobsByStoredNames } from './jobs.js';
import { increment, setGauge } from './production/metrics.js';
import { migrateDatabase } from './cad/calculations/migrations.js';

export async function ensureUploadDir(uploadDir) { await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 }); }

export async function ensureProductionDirectories(config) {
  const directories = [config.databaseDir, config.sourceFilesDir, config.viewerMeshDir, config.previewsDir, config.reportsDir, config.backupsDir, config.uploadDir, config.tempDir];
  for (const directory of directories) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
}

function inside(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  return resolved !== resolvedRoot && resolved.startsWith(`${resolvedRoot}${path.sep}`);
}

async function directorySize(root) {
  let total = 0;
  const visit = async (directory) => {
    let entries = [];
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) total += (await fs.stat(file)).size;
    }
  };
  await visit(root);
  return total;
}

async function cleanRoot(root, cutoff, { dryRun, active = new Set(), includeDirectories = false }) {
  const deleted = [];
  let entries = [];
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return deleted; }
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (!inside(root, candidate) || entry.isSymbolicLink() || active.has(path.resolve(candidate))) continue;
    if (!entry.isFile() && !(includeDirectories && entry.isDirectory())) continue;
    const stat = await fs.stat(candidate);
    if (stat.mtimeMs > cutoff) continue;
    if (!dryRun) await fs.rm(candidate, { recursive: entry.isDirectory(), force: true });
    deleted.push({ path: path.relative(root, candidate), sizeBytes: entry.isFile() ? stat.size : 0 });
  }
  return deleted;
}

export async function cleanupStorage(config, { dryRun = false, now = Date.now(), logger = console } = {}) {
  await ensureProductionDirectories(config);
  const activeByRoot = new Map();
  let expiredJobs = 0;
  try {
    const database = migrateDatabase(config.databasePath);
    try {
      const calculationIds = database.prepare('SELECT id FROM calculations').all().map((row) => row.id);
      for (const root of [config.sourceFilesDir, config.viewerMeshDir, config.previewsDir, config.reportsDir]) activeByRoot.set(path.resolve(root), new Set(calculationIds.map((id) => path.resolve(root, id))));
      const activeUploads = new Set();
      for (const row of database.prepare("SELECT payload_json FROM cad_jobs WHERE status IN ('queued','processing','retry_wait')").all()) {
        const storedName = JSON.parse(row.payload_json).storedName;
        if (storedName) activeUploads.add(path.resolve(config.uploadDir, storedName));
      }
      activeByRoot.set(path.resolve(config.uploadDir), activeUploads);
      const cutoff = new Date(now - config.failedJobRetentionDays * 86_400_000).toISOString();
      expiredJobs = Number(database.prepare("SELECT COUNT(*) AS count FROM cad_jobs WHERE status IN ('failed','cancelled','timed_out') AND updated_at<?").get(cutoff).count);
      if (!dryRun) database.prepare("DELETE FROM cad_jobs WHERE status IN ('failed','cancelled','timed_out') AND updated_at<?").run(cutoff);
    } finally { database.close(); }
  } catch { /* An unavailable database must not make cleanup delete more files. */ }
  const policies = [
    { kind: 'source', root: config.uploadDir, ageMs: config.sourceFileRetentionDays * 86_400_000 },
    { kind: 'mesh', root: config.viewerMeshDir, ageMs: config.meshRetentionDays * 86_400_000, directories: true },
    { kind: 'preview', root: config.previewsDir, ageMs: config.previewRetentionDays * 86_400_000, directories: true },
    { kind: 'report', root: config.reportsDir, ageMs: config.reportRetentionDays * 86_400_000, directories: true },
    { kind: 'temp', root: config.tempDir, ageMs: config.tempFileMaxAgeMinutes * 60_000, directories: true },
  ];
  const results = [];
  for (const policy of policies) {
    const deleted = await cleanRoot(policy.root, now - policy.ageMs, { dryRun, includeDirectories: policy.directories, active: activeByRoot.get(path.resolve(policy.root)) ?? new Set() });
    results.push(...deleted.map((item) => ({ ...item, kind: policy.kind })));
  }
  if (!dryRun) increment('cad_cleanup_deleted_total', {}, results.length);
  setGauge('cad_temp_files', {}, (await fs.readdir(config.tempDir)).length);
  setGauge('cad_storage_bytes', {}, await directorySize(config.storageRoot));
  logger.info?.('cad_storage_cleanup', { dryRun, deleted: results.length, expiredJobs, objects: results });
  return results;
}

export async function cleanupExpiredFiles(config, logger = console) {
  await ensureUploadDir(config.uploadDir);
  const deleted = await cleanRoot(config.uploadDir, Date.now() - config.sourceFileRetentionDays * 86_400_000, { dryRun: false });
  if (deleted.length) {
    deleteJobsByStoredNames(deleted.map((entry) => entry.path));
    logger.info?.('cad_upload_cleanup', { deleted: deleted.length });
  }
  return deleted.map((entry) => entry.path);
}
