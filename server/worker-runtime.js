import { randomUUID } from 'node:crypto';
import { cadConfig } from './config.js';
import { configureJobStore, claimNextJob, getJob, updateJob, heartbeatJob, recoverStaleJobs, updateWorkerHeartbeat } from './jobs.js';
import { processCadJob } from './cad/processor.js';
import { createLogger } from './production/logger.js';
import { observe } from './production/metrics.js';

const TRANSIENT_ERRORS = new Set(['ANTIVIRUS_UNAVAILABLE', 'SQLITE_BUSY', 'WORKER_LOST']);

export function createWorker(overrides = {}) {
  const config = { ...cadConfig, ...overrides };
  const workerId = overrides.workerId || `worker-${randomUUID()}`;
  const logger = overrides.logger || createLogger({ service: 'cad-worker', environment: config.environment, applicationVersion: config.applicationVersion, level: config.logLevel, format: config.logFormat, redactFields: config.logRedactFields });
  const store = configureJobStore(config.databasePath);
  const active = new Map();
  let stopping = false;
  let pollTimer = null;
  let heartbeatTimer = null;

  async function execute(job) {
    const started = Date.now();
    observe('cad_queue_wait_duration_seconds', { job_type: job.jobType }, Math.max(0, (started - Date.parse(job.queuedAt)) / 1000));
    const timer = setInterval(() => heartbeatJob(job.id, workerId), config.jobHeartbeatIntervalMs);
    timer.unref();
    logger.info('cad_job_started', { jobId: job.id, calculationId: job.calculationId, correlationId: job.correlationId, workerId, attempt: job.attempt });
    try {
      const completed = await processCadJob(job.id, config);
      if (!completed) return;
      if (completed.status === 'failed' && completed.attempt < completed.maxAttempts && TRANSIENT_ERRORS.has(completed.errorCode ?? completed.error?.code)) {
        updateJob(job.id, { status: 'retry_wait', retryAt: new Date(Date.now() + Math.min(30_000, 1_000 * (2 ** completed.attempt))).toISOString(), workerId: null, heartbeatAt: null });
        logger.warn('cad_job_retry_scheduled', { jobId: job.id, correlationId: job.correlationId, workerId, errorCode: completed.errorCode });
      } else {
        logger.info('cad_job_finished', { jobId: job.id, calculationId: job.calculationId, correlationId: job.correlationId, workerId, status: completed.status, durationMs: Date.now() - started, errorCode: completed.errorCode });
      }
    } catch (error) {
      const current = getJob(job.id);
      updateJob(job.id, { status: 'failed', errorCode: 'WORKER_EXECUTION_FAILED', publicError: 'Worker не смог завершить задание', internalErrorReference: `${job.correlationId}:${job.id}` });
      logger.error('cad_job_worker_error', { jobId: job.id, correlationId: job.correlationId, workerId, errorCode: current?.errorCode ?? 'WORKER_EXECUTION_FAILED', message: error.message, stack: error.stack });
    } finally {
      clearInterval(timer);
      active.delete(job.id);
      updateWorkerHeartbeat(workerId, { concurrency: config.workerConcurrency, activeJobs: active.size, applicationVersion: config.applicationVersion, shutdownRequested: stopping });
    }
  }

  function poll() {
    if (stopping) return;
    recoverStaleJobs(config.jobStaleAfterMs, config.jobMaxAttempts);
    while (active.size < config.workerConcurrency) {
      const job = claimNextJob(workerId, { timeoutMs: config.jobTimeoutMs });
      if (!job) break;
      const promise = execute(job);
      active.set(job.id, promise);
    }
    updateWorkerHeartbeat(workerId, { concurrency: config.workerConcurrency, activeJobs: active.size, applicationVersion: config.applicationVersion });
  }

  function start() {
    logger.info('cad_worker_started', { workerId, concurrency: config.workerConcurrency });
    updateWorkerHeartbeat(workerId, { concurrency: config.workerConcurrency, activeJobs: 0, applicationVersion: config.applicationVersion });
    poll();
    pollTimer = setInterval(poll, config.queuePollIntervalMs);
    heartbeatTimer = setInterval(() => updateWorkerHeartbeat(workerId, { concurrency: config.workerConcurrency, activeJobs: active.size, applicationVersion: config.applicationVersion, shutdownRequested: stopping }), config.jobHeartbeatIntervalMs);
    return api;
  }

  async function stop({ timeoutMs = 30_000 } = {}) {
    stopping = true;
    clearInterval(pollTimer); clearInterval(heartbeatTimer);
    updateWorkerHeartbeat(workerId, { concurrency: config.workerConcurrency, activeJobs: active.size, applicationVersion: config.applicationVersion, shutdownRequested: true });
    await Promise.race([Promise.allSettled(active.values()), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
    for (const jobId of active.keys()) {
      const job = getJob(jobId);
      if (job?.status === 'processing') updateJob(jobId, { status: 'queued', workerId: null, heartbeatAt: null, startedAt: null, timeoutAt: null, queuedAt: new Date().toISOString() });
    }
    logger.info('cad_worker_stopped', { workerId, remainingJobs: active.size });
    store.close();
  }

  const api = { start, stop, poll, workerId, active, config };
  return api;
}
