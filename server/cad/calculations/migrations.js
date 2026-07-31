import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS = [{
  version: 1,
  sql: `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calculations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_file_name TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      source_size INTEGER NOT NULL,
      source_ref TEXT NOT NULL,
      mesh_ref TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      revision_number INTEGER NOT NULL DEFAULT 1,
      application_version TEXT NOT NULL,
      algorithm_version TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_calculations_updated ON calculations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_calculations_status ON calculations(status);
    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY,
      calculation_id TEXT NOT NULL REFERENCES calculations(id) ON DELETE CASCADE,
      revision_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      reason TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      algorithm_version TEXT NOT NULL,
      parent_revision_id TEXT,
      UNIQUE(calculation_id, revision_number)
    );
    CREATE TABLE IF NOT EXISTS decision_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calculation_id TEXT NOT NULL REFERENCES calculations(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT,
      created_at TEXT NOT NULL
    );
  `,
}, {
  version: 2,
  sql: `
    CREATE TABLE IF NOT EXISTS cad_jobs (
      job_id TEXT PRIMARY KEY,
      calculation_id TEXT,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','failed','cancelled','timed_out','retry_wait')),
      priority INTEGER NOT NULL DEFAULT 0,
      attempt INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 2,
      created_at TEXT NOT NULL,
      queued_at TEXT NOT NULL,
      started_at TEXT,
      heartbeat_at TEXT,
      completed_at TEXT,
      failed_at TEXT,
      timeout_at TEXT,
      retry_at TEXT,
      worker_id TEXT,
      correlation_id TEXT NOT NULL,
      payload_version TEXT NOT NULL DEFAULT '1.0.0',
      payload_json TEXT NOT NULL,
      result_json TEXT,
      error_code TEXT,
      public_error TEXT,
      internal_error_reference TEXT,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      idempotency_key TEXT UNIQUE,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cad_jobs_claim ON cad_jobs(status, retry_at, priority DESC, queued_at ASC);
    CREATE INDEX IF NOT EXISTS idx_cad_jobs_calculation ON cad_jobs(calculation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cad_jobs_correlation ON cad_jobs(correlation_id);
    CREATE TABLE IF NOT EXISTS worker_heartbeats (
      worker_id TEXT PRIMARY KEY,
      service_version TEXT NOT NULL,
      concurrency INTEGER NOT NULL,
      active_jobs INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      shutdown_requested INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS backup_history (
      backup_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      application_version TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      database_size INTEGER NOT NULL,
      sha256 TEXT,
      manifest_ref TEXT,
      error_code TEXT
    );
  `,
}];

export function migrateDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 10000;
    PRAGMA wal_autocheckpoint = 1000;
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
  `);
  const newestKnown = Math.max(...MIGRATIONS.map((migration) => migration.version));
  const readApplied = () => new Set(database.prepare('SELECT version FROM schema_migrations').all().map((row) => Number(row.version)));
  const validateApplied = (applied) => {
    const unknownNewer = [...applied].filter((version) => version > newestKnown);
    if (unknownNewer.length) throw Object.assign(new Error(`Database schema ${Math.max(...unknownNewer)} is newer than supported ${newestKnown}`), { code: 'DATABASE_SCHEMA_TOO_NEW' });
  };
  const initiallyApplied = readApplied();
  validateApplied(initiallyApplied);
  if (MIGRATIONS.some((migration) => !initiallyApplied.has(migration.version))) {
    database.exec('BEGIN EXCLUSIVE');
    try {
      const applied = readApplied();
      validateApplied(applied);
      const insert = database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)');
      for (const migration of MIGRATIONS) {
        if (applied.has(migration.version)) continue;
        database.exec(migration.sql);
        insert.run(migration.version, new Date().toISOString());
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      database.close();
      throw error;
    }
  }
  return database;
}

export function databaseStatus(databasePath) {
  const database = migrateDatabase(databasePath);
  try {
    const integrity = database.prepare('PRAGMA quick_check').get();
    const mode = database.prepare('PRAGMA journal_mode').get();
    const foreignKeys = database.prepare('PRAGMA foreign_keys').get();
    return {
      databasePath,
      schemaVersion: Math.max(0, ...database.prepare('SELECT version FROM schema_migrations').all().map((row) => Number(row.version))),
      migrations: database.prepare('SELECT version, applied_at AS appliedAt FROM schema_migrations ORDER BY version').all(),
      journalMode: Object.values(mode)[0],
      foreignKeys: Number(Object.values(foreignKeys)[0]) === 1,
      integrity: Object.values(integrity)[0],
    };
  } finally {
    database.close();
  }
}
