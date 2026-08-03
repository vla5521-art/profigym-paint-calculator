import { randomUUID } from 'node:crypto';
import { migrateDatabase } from './cad/calculations/migrations.js';

const memoryJobs = new Map();
let database = null;

const nowIso = () => new Date().toISOString();
const isoAfter = (milliseconds) => new Date(Date.now() + milliseconds).toISOString();

function parseRow(row) {
  if (!row) return null;
  const payload = JSON.parse(row.payload_json);
  const result = row.result_json ? JSON.parse(row.result_json) : {};
  return {
    ...payload,
    ...result,
    id: row.job_id,
    jobId: row.job_id,
    calculationId: row.calculation_id,
    jobType: row.job_type,
    status: row.status,
    priority: Number(row.priority),
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    createdAt: row.created_at,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    heartbeatAt: row.heartbeat_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    timeoutAt: row.timeout_at,
    retryAt: row.retry_at,
    workerId: row.worker_id,
    correlationId: row.correlation_id,
    payloadVersion: row.payload_version,
    errorCode: row.error_code,
    publicError: row.public_error,
    internalErrorReference: row.internal_error_reference,
    cancelRequested: Boolean(row.cancel_requested),
    updatedAt: row.updated_at,
  };
}

export function configureJobStore(databasePath) {
  if (database) database.close();
  database = migrateDatabase(databasePath);
  return {
    close() {
      if (database) database.close();
      database = null;
    },
  };
}

export function createJob({
  originalName,
  storedName,
  size,
  extension,
  uploadMs = 0,
  calculationId = null,
  jobType = 'cad_import',
  priority = 0,
  correlationId = randomUUID(),
  maxAttempts = 2,
  idempotencyKey = null,
}) {
  const now = nowIso();
  const job = {
    id: randomUUID(),
    jobId: null,
    calculationId,
    jobType,
    status: 'queued',
    priority,
    attempt: 0,
    maxAttempts,
    originalName,
    storedName,
    size,
    extension,
    createdAt: now,
    queuedAt: now,
    startedAt: null,
    heartbeatAt: null,
    completedAt: null,
    failedAt: null,
    timeoutAt: null,
    retryAt: null,
    workerId: null,
    correlationId,
    payloadVersion: '1.0.0',
    errorCode: null,
    publicError: null,
    internalErrorReference: null,
    cancelRequested: false,
    updatedAt: now,
    error: null,
    area: null,
    paintableArea: null,
    diagnostics: null,
    contacts: [],
    contactSummary: null,
    contactStatistics: null,
    features: [],
    featureSummary: null,
    featureStatistics: null,
    featureRules: null,
    faceCatalog: [],
    viewerMesh: null,
    report: null,
    performance: { uploadMs, importMs: null, calculationMs: null, totalMs: null },
  };
  job.jobId = job.id;
  if (!database) {
    memoryJobs.set(job.id, job);
    return job;
  }
  const payload = { originalName, storedName, size, extension, performance: job.performance };
  try {
    database.prepare(`INSERT INTO cad_jobs
      (job_id,calculation_id,job_type,status,priority,attempt,max_attempts,created_at,queued_at,correlation_id,payload_version,payload_json,result_json,idempotency_key,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      job.id, calculationId, jobType, 'queued', priority, 0, maxAttempts, now, now, correlationId,
      '1.0.0', JSON.stringify(payload), JSON.stringify(job), idempotencyKey, now,
    );
  } catch (error) {
    if (idempotencyKey && String(error.message).includes('UNIQUE')) {
      return parseRow(database.prepare('SELECT * FROM cad_jobs WHERE idempotency_key=?').get(idempotencyKey));
    }
    throw error;
  }
  return job;
}

export function getJob(id) {
  if (!database) return memoryJobs.get(id) ?? null;
  return parseRow(database.prepare('SELECT * FROM cad_jobs WHERE job_id=?').get(id));
}

export function updateJob(id, patch) {
  const current = getJob(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: nowIso() };
  if (patch.status === 'completed' && !next.completedAt) next.completedAt = next.updatedAt;
  if (['failed', 'timed_out'].includes(patch.status) && !next.failedAt) next.failedAt = next.updatedAt;
  if (!database) {
    memoryJobs.set(id, next);
    return next;
  }
  database.prepare(`UPDATE cad_jobs SET
    calculation_id=?, status=?, priority=?, attempt=?, max_attempts=?, started_at=?, heartbeat_at=?, completed_at=?, failed_at=?, timeout_at=?, retry_at=?, worker_id=?,
    correlation_id=?, payload_version=?, result_json=?, error_code=?, public_error=?, internal_error_reference=?, cancel_requested=?, updated_at=? WHERE job_id=?`).run(
    next.calculationId, next.status, next.priority, next.attempt, next.maxAttempts, next.startedAt, next.heartbeatAt,
    next.completedAt, next.failedAt, next.timeoutAt, next.retryAt, next.workerId, next.correlationId, next.payloadVersion,
    JSON.stringify(next), next.errorCode ?? next.error?.code ?? null, next.publicError ?? next.error?.message ?? null,
    next.internalErrorReference, next.cancelRequested ? 1 : 0, next.updatedAt, id,
  );
  return next;
}

export function claimNextJob(workerId, { timeoutMs = 300_000 } = {}) {
  if (!database) {
    const job = [...memoryJobs.values()].filter((item) => item.status === 'queued').sort((a, b) => b.priority - a.priority || a.queuedAt.localeCompare(b.queuedAt))[0];
    if (!job) return null;
    return updateJob(job.id, { status: 'processing', workerId, attempt: job.attempt + 1, startedAt: nowIso(), heartbeatAt: nowIso(), timeoutAt: isoAfter(timeoutMs) });
  }
  database.exec('BEGIN IMMEDIATE');
  try {
    const now = nowIso();
    const row = database.prepare(`SELECT job_id FROM cad_jobs
      WHERE (status='queued' OR (status='retry_wait' AND retry_at<=?)) AND cancel_requested=0
      ORDER BY priority DESC, queued_at ASC LIMIT 1`).get(now);
    if (!row) {
      database.exec('COMMIT');
      return null;
    }
    const current = parseRow(database.prepare('SELECT * FROM cad_jobs WHERE job_id=?').get(row.job_id));
    database.prepare(`UPDATE cad_jobs SET status='processing', attempt=attempt+1, worker_id=?, started_at=?, heartbeat_at=?, timeout_at=?, updated_at=?
      WHERE job_id=? AND status IN ('queued','retry_wait')`).run(workerId, now, now, isoAfter(timeoutMs), now, row.job_id);
    database.exec('COMMIT');
    return { ...getJob(row.job_id), attempt: current.attempt + 1 };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function heartbeatJob(id, workerId) {
  const current = getJob(id);
  if (!current || current.status !== 'processing' || current.workerId !== workerId) return false;
  updateJob(id, { heartbeatAt: nowIso() });
  return true;
}

export function requestJobCancellation(id) {
  const job = getJob(id);
  if (!job || ['completed', 'failed', 'cancelled', 'timed_out'].includes(job.status)) return job;
  return updateJob(id, job.status === 'queued' || job.status === 'retry_wait'
    ? { status: 'cancelled', cancelRequested: true }
    : { cancelRequested: true });
}

export function recoverStaleJobs(staleAfterMs, maxAttempts) {
  if (!database) return 0;
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const stale = database.prepare(`SELECT * FROM cad_jobs WHERE status='processing' AND (heartbeat_at IS NULL OR heartbeat_at<?)`).all(cutoff);
  for (const row of stale) {
    const job = parseRow(row);
    const exhausted = job.attempt >= Math.min(job.maxAttempts, maxAttempts);
    updateJob(job.id, exhausted
      ? { status: 'failed', errorCode: 'WORKER_LOST', publicError: 'Обработка прервана: worker недоступен', workerId: null }
      : { status: 'queued', queuedAt: nowIso(), startedAt: null, heartbeatAt: null, timeoutAt: null, workerId: null });
  }
  return stale.length;
}

export function updateWorkerHeartbeat(workerId, { concurrency, activeJobs, applicationVersion = '2.0.3', shutdownRequested = false }) {
  if (!database) return;
  const now = nowIso();
  database.prepare(`INSERT INTO worker_heartbeats(worker_id,service_version,concurrency,active_jobs,started_at,heartbeat_at,shutdown_requested)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(worker_id) DO UPDATE SET service_version=excluded.service_version,concurrency=excluded.concurrency,
    active_jobs=excluded.active_jobs,heartbeat_at=excluded.heartbeat_at,shutdown_requested=excluded.shutdown_requested`).run(
    workerId, applicationVersion, concurrency, activeJobs, now, now, shutdownRequested ? 1 : 0,
  );
}

export function freshestWorkerHeartbeat() {
  if (!database) return null;
  const row = database.prepare('SELECT * FROM worker_heartbeats ORDER BY heartbeat_at DESC LIMIT 1').get();
  return row ? { workerId: row.worker_id, applicationVersion: row.service_version, concurrency: Number(row.concurrency), activeJobs: Number(row.active_jobs), startedAt: row.started_at, heartbeatAt: row.heartbeat_at, shutdownRequested: Boolean(row.shutdown_requested) } : null;
}

export function queueStats() {
  if (!database) {
    const counts = {};
    for (const job of memoryJobs.values()) counts[job.status] = (counts[job.status] ?? 0) + 1;
    return counts;
  }
  return Object.fromEntries(database.prepare('SELECT status, COUNT(*) AS count FROM cad_jobs GROUP BY status').all().map((row) => [row.status, Number(row.count)]));
}

export function deleteJobsByStoredNames(names) {
  const target = new Set(names);
  if (!database) {
    for (const [id, job] of memoryJobs) if (target.has(job.storedName)) memoryJobs.delete(id);
    return;
  }
  for (const row of database.prepare('SELECT job_id,payload_json FROM cad_jobs').all()) {
    const payload = JSON.parse(row.payload_json);
    if (target.has(payload.storedName)) database.prepare('DELETE FROM cad_jobs WHERE job_id=?').run(row.job_id);
  }
}

export function clearJobs() {
  memoryJobs.clear();
  if (database) database.exec('DELETE FROM cad_jobs; DELETE FROM worker_heartbeats;');
}

export function publicJob(job) {
  if (!job) return null;
  const safe = { ...job };
  delete safe.storedName;
  delete safe.report;
  delete safe.contacts;
  delete safe.features;
  delete safe.faceCatalog;
  delete safe.internalErrorReference;
  return safe;
}
