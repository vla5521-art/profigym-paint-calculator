import path from 'node:path';
import { contactConfig } from './cad/contacts/config.js';
import { featureConfig } from './cad/features/config.js';
import { viewerConfig } from './cad/viewer/config.js';

const number = (name, fallback, minimum = 0) => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
};
const bool = (name, fallback = false) => process.env[name] === undefined
  ? fallback
  : !['0', 'false', 'no', 'off'].includes(String(process.env[name]).toLowerCase());
const csv = (value) => String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
const storageRoot = path.resolve(process.env.CAD_STORAGE_ROOT || (process.env.NODE_ENV === 'production' ? '/data' : '.tmp/cad-runtime'));
const environment = process.env.NODE_ENV || 'development';

export const cadConfig = {
  applicationVersion: '2.1.1',
  environment,
  port: number('CAD_API_PORT', 8787, 1),
  publicUrl: process.env.APP_PUBLIC_URL || 'http://127.0.0.1:8787',
  allowedOrigins: csv(process.env.APP_ALLOWED_ORIGINS || 'http://127.0.0.1:8787,http://localhost:8787'),
  trustProxy: bool('TRUST_PROXY', environment === 'production'),
  storageRoot,
  databaseDir: path.resolve(process.env.CAD_DATABASE_DIR || path.join(storageRoot, 'database')),
  sourceFilesDir: path.resolve(process.env.CAD_SOURCE_FILES_DIR || path.join(storageRoot, 'source-files')),
  viewerMeshDir: path.resolve(process.env.CAD_VIEWER_MESH_DIR || process.env.CAD_MESH_CACHE_DIR || path.join(storageRoot, 'viewer-mesh')),
  previewsDir: path.resolve(process.env.CAD_PREVIEWS_DIR || path.join(storageRoot, 'previews')),
  reportsDir: path.resolve(process.env.CAD_REPORTS_DIR || process.env.CAD_REPORT_DIR || path.join(storageRoot, 'reports')),
  backupsDir: path.resolve(process.env.CAD_BACKUPS_DIR || path.join(storageRoot, 'backups')),
  tempDir: path.resolve(process.env.CAD_TEMP_DIR || '/tmp/cad-processing'),
  uploadDir: path.resolve(process.env.CAD_UPLOAD_DIR || path.join(storageRoot, 'source-files', 'incoming')),
  calculationStoragePath: path.resolve(process.env.CAD_CALCULATION_STORAGE_PATH || storageRoot),
  databasePath: path.resolve(process.env.CAD_DATABASE_PATH || path.join(storageRoot, 'database', 'profigym.sqlite')),
  frontendDistPath: path.resolve(process.env.CAD_FRONTEND_DIST_PATH || 'dist'),
  maxFileSizeBytes: number('CAD_MAX_UPLOAD_BYTES', 50 * 1024 * 1024, 1),
  maxJsonBodyBytes: number('CAD_MAX_JSON_BODY_BYTES', 256 * 1024, 1024),
  reportPreviewMaxBytes: number('CAD_MAX_PREVIEW_BYTES', 2 * 1024 * 1024, 1024),
  reportPreviewMaxWidth: number('CAD_REPORT_PREVIEW_MAX_WIDTH', 4096, 1),
  reportPreviewMaxHeight: number('CAD_REPORT_PREVIEW_MAX_HEIGHT', 4096, 1),
  viewerMaxTriangles: number('CAD_VIEWER_MAX_TRIANGLES', 750_000, 1),
  allowedExtensions: ['.stp', '.step'],
  processingMode: process.env.CAD_PROCESSING_MODE || (environment === 'production' ? 'queue' : 'inline'),
  workerRequired: bool('CAD_WORKER_REQUIRED', environment === 'production'),
  workerConcurrency: Math.floor(number('CAD_WORKER_CONCURRENCY', 1, 1)),
  queuePollIntervalMs: number('CAD_QUEUE_POLL_INTERVAL_MS', 500, 25),
  jobHeartbeatIntervalMs: number('CAD_JOB_HEARTBEAT_INTERVAL_MS', 5_000, 250),
  jobStaleAfterMs: number('CAD_JOB_STALE_AFTER_MS', 30_000, 1_000),
  jobMaxAttempts: Math.floor(number('CAD_JOB_MAX_ATTEMPTS', 2, 1)),
  jobTimeoutMs: number('CAD_JOB_TIMEOUT_MS', 5 * 60 * 1000, environment === 'test' ? 1 : 1_000),
  importTimeoutMs: number('CAD_IMPORT_TIMEOUT_MS', 2 * 60 * 1000, environment === 'test' ? 1 : 1_000),
  contactTimeoutMs: number('CAD_CONTACT_TIMEOUT_MS', 2 * 60 * 1000, environment === 'test' ? 1 : 1_000),
  featureTimeoutMs: number('CAD_FEATURE_TIMEOUT_MS', 2 * 60 * 1000, environment === 'test' ? 1 : 1_000),
  viewerTimeoutMs: number('CAD_VIEWER_TIMEOUT_MS', 90_000, environment === 'test' ? 1 : 1_000),
  reportTimeoutMs: number('CAD_REPORT_TIMEOUT_MS', 30_000, environment === 'test' ? 1 : 1_000),
  sourceFileRetentionEnabled: bool('CAD_SOURCE_FILE_RETENTION_ENABLED', true),
  sourceFileRetentionDays: number('CAD_SOURCE_RETENTION_DAYS', 30),
  meshRetentionDays: number('CAD_MESH_RETENTION_DAYS', 90),
  previewRetentionDays: number('CAD_PREVIEW_RETENTION_DAYS', 30),
  reportRetentionDays: number('CAD_REPORT_RETENTION_DAYS', 30),
  failedJobRetentionDays: number('CAD_FAILED_JOB_RETENTION_DAYS', 14),
  tempFileMaxAgeMinutes: number('CAD_TEMP_FILE_MAX_AGE_MINUTES', 60),
  cleanupIntervalMinutes: number('CAD_CLEANUP_INTERVAL_MINUTES', 60, 1),
  accessToken: process.env.PROFIGYM_ACCESS_TOKEN || '',
  metricsToken: process.env.PROFIGYM_METRICS_TOKEN || process.env.PROFIGYM_ACCESS_TOKEN || '',
  sessionTtlSeconds: number('PROFIGYM_SESSION_TTL_SECONDS', 8 * 60 * 60, 60),
  logLevel: process.env.LOG_LEVEL || 'info',
  logFormat: process.env.LOG_FORMAT || (environment === 'production' ? 'json' : 'pretty'),
  logRedactFields: csv(process.env.LOG_REDACT_FIELDS || 'authorization,cookie,token,password,secret,stack'),
  antivirus: {
    enabled: bool('CAD_ANTIVIRUS_ENABLED', false),
    host: process.env.CAD_ANTIVIRUS_HOST || 'clamav',
    port: number('CAD_ANTIVIRUS_PORT', 3310, 1),
    timeoutMs: number('CAD_ANTIVIRUS_TIMEOUT_MS', 10_000, 100),
    failMode: process.env.CAD_ANTIVIRUS_FAIL_MODE || (environment === 'production' ? 'closed' : 'open'),
  },
  rateLimits: {
    login: { limit: number('RATE_LIMIT_LOGIN', 10, 1), windowMs: 60_000 },
    upload: { limit: number('RATE_LIMIT_UPLOAD', 10, 1), windowMs: 60_000 },
    read: { limit: number('RATE_LIMIT_READ', 300, 1), windowMs: 60_000 },
    write: { limit: number('RATE_LIMIT_WRITE', 120, 1), windowMs: 60_000 },
    report: { limit: number('RATE_LIMIT_REPORT', 30, 1), windowMs: 60_000 },
    recalculate: { limit: number('RATE_LIMIT_RECALCULATE', 10, 1), windowMs: 60_000 },
  },
  contact: contactConfig,
  features: featureConfig,
  viewer: { ...viewerConfig, maxTriangles: number('CAD_VIEWER_MAX_TRIANGLES', viewerConfig.maxTriangles ?? 750_000, 1) },
  testProcessingDelayMs: environment === 'test' ? number('CAD_TEST_PROCESSING_DELAY_MS', 0) : 0,
  testTimeoutFixtureName: environment === 'test' ? String(process.env.CAD_TEST_TIMEOUT_FIXTURE || 'timeout_fixture.step') : '',
};

export function validateProductionConfig(config = cadConfig) {
  const errors = [];
  if (config.environment === 'production' && !config.accessToken) errors.push('PROFIGYM_ACCESS_TOKEN is required');
  if (!['inline', 'queue'].includes(config.processingMode)) errors.push('CAD_PROCESSING_MODE must be inline or queue');
  if (!['open', 'closed'].includes(config.antivirus.failMode)) errors.push('CAD_ANTIVIRUS_FAIL_MODE must be open or closed');
  if (config.workerConcurrency < 1) errors.push('CAD_WORKER_CONCURRENCY must be at least 1');
  return errors;
}
