import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { migrateDatabase, databaseStatus } from '../cad/calculations/migrations.js';
import { increment } from './metrics.js';

export async function sha256(file) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

export async function createBackup(config) {
  await fs.mkdir(config.backupsDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `${stamp}-${randomUUID()}`;
  const databaseFile = path.join(config.backupsDir, `${backupId}.sqlite`);
  const manifestFile = path.join(config.backupsDir, `${backupId}.manifest.json`);
  const database = migrateDatabase(config.databasePath);
  try {
    database.exec('PRAGMA wal_checkpoint(FULL)');
    database.prepare('VACUUM INTO ?').run(databaseFile);
  } finally { database.close(); }
  const status = databaseStatus(databaseFile);
  const stat = await fs.stat(databaseFile);
  const manifest = {
    backupId,
    createdAt: new Date().toISOString(),
    applicationVersion: config.applicationVersion,
    schemaVersion: status.schemaVersion,
    databaseFile: path.basename(databaseFile),
    sizeBytes: stat.size,
    sha256: await sha256(databaseFile),
    sourceFilesIncluded: false,
  };
  await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  const history = migrateDatabase(config.databasePath);
  try { history.prepare('INSERT INTO backup_history(backup_id,created_at,status,application_version,schema_version,database_size,sha256,manifest_ref) VALUES(?,?,?,?,?,?,?,?)').run(backupId, manifest.createdAt, 'completed', config.applicationVersion, status.schemaVersion, stat.size, manifest.sha256, path.basename(manifestFile)); } finally { history.close(); }
  increment('cad_backup_success_total');
  return { manifest, databaseFile, manifestFile };
}

export async function listBackups(config) {
  await fs.mkdir(config.backupsDir, { recursive: true, mode: 0o700 });
  const files = (await fs.readdir(config.backupsDir)).filter((name) => name.endsWith('.manifest.json')).sort().reverse();
  return Promise.all(files.map(async (name) => JSON.parse(await fs.readFile(path.join(config.backupsDir, name), 'utf8'))));
}

export async function verifyBackup(config, backupId) {
  const manifests = await listBackups(config);
  const manifest = backupId ? manifests.find((item) => item.backupId === backupId) : manifests[0];
  if (!manifest) throw Object.assign(new Error('Backup не найден'), { code: 'BACKUP_NOT_FOUND' });
  const databaseFile = path.join(config.backupsDir, manifest.databaseFile);
  const hash = await sha256(databaseFile);
  if (hash !== manifest.sha256) throw Object.assign(new Error('SHA-256 backup не совпадает'), { code: 'BACKUP_HASH_MISMATCH' });
  const status = databaseStatus(databaseFile);
  if (status.integrity !== 'ok' || status.schemaVersion !== manifest.schemaVersion) throw Object.assign(new Error('Backup не прошёл integrity/schema проверку'), { code: 'BACKUP_INVALID' });
  return { ok: true, manifest, status };
}

export async function restoreBackupTest(config, backupId) {
  const verified = await verifyBackup(config, backupId);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'profigym-restore-test-'));
  const restored = path.join(directory, 'restored.sqlite');
  try {
    await fs.copyFile(path.join(config.backupsDir, verified.manifest.databaseFile), restored);
    const status = databaseStatus(restored);
    const database = migrateDatabase(restored);
    let calculations = 0;
    try { calculations = Number(database.prepare('SELECT COUNT(*) AS count FROM calculations').get().count); } finally { database.close(); }
    return { ok: status.integrity === 'ok', backupId: verified.manifest.backupId, schemaVersion: status.schemaVersion, calculations };
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

export async function restoreBackup(config, backupId) {
  const verified = await verifyBackup(config, backupId);
  await fs.mkdir(path.dirname(config.databasePath), { recursive: true, mode: 0o700 });
  const temporary = `${config.databasePath}.restore-${randomUUID()}`;
  const safetyCopy = `${config.databasePath}.pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const source = path.join(config.backupsDir, verified.manifest.databaseFile);
  await fs.copyFile(source, temporary);
  const temporaryStatus = databaseStatus(temporary);
  if (temporaryStatus.integrity !== 'ok' || temporaryStatus.schemaVersion !== verified.manifest.schemaVersion) {
    await fs.rm(temporary, { force: true });
    throw Object.assign(new Error('Подготовленная копия backup не прошла повторную проверку'), { code: 'BACKUP_RESTORE_INVALID' });
  }

  let previousDatabaseMoved = false;
  try {
    await fs.rename(config.databasePath, safetyCopy);
    previousDatabaseMoved = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.rm(`${config.databasePath}-wal`, { force: true });
  await fs.rm(`${config.databasePath}-shm`, { force: true });
  try {
    await fs.rename(temporary, config.databasePath);
  } catch (error) {
    if (previousDatabaseMoved) await fs.rename(safetyCopy, config.databasePath).catch(() => undefined);
    throw error;
  }
  const restored = databaseStatus(config.databasePath);
  return {
    ok: restored.integrity === 'ok',
    backupId: verified.manifest.backupId,
    schemaVersion: restored.schemaVersion,
    sha256: verified.manifest.sha256,
    safetyCopy: previousDatabaseMoved ? path.basename(safetyCopy) : null,
  };
}

export async function cleanupBackups(config, retentionDays = 30) {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const manifests = await listBackups(config);
  let deleted = 0;
  for (const manifest of manifests) {
    if (Date.parse(manifest.createdAt) > cutoff) continue;
    await fs.rm(path.join(config.backupsDir, manifest.databaseFile), { force: true });
    await fs.rm(path.join(config.backupsDir, `${manifest.backupId}.manifest.json`), { force: true });
    deleted += 1;
  }
  return { deleted };
}
