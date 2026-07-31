import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { cadConfig } from './config.js';
import { ApiError, errorPayload } from './errors.js';
import { createJob, getJob, publicJob, updateJob, configureJobStore, requestJobCancellation } from './jobs.js';
import { ensureProductionDirectories } from './storage.js';
import { processCadJob } from './cad/processor.js';
import { isAllowedStepMimeType, STEP_EXTENSIONS, STEP_MIME_TYPES } from './cad/importers/step.js';
import {
  publicContactsResult,
  recalculateContactSummary,
} from './cad/contacts/service.js';
import {
  createManualFeature,
  publicFeaturesResult,
  reclassifyFeatures,
  refreshStage4JobState,
} from './cad/features/service.js';
import {
  mergeFeatureRules,
} from './cad/features/config.js';
import { publicRuleConfig } from './cad/features/rules.js';
import { createCalculationRouter } from './cad/calculations/routes.js';
import { recolorViewerMesh } from './cad/viewer/service.js';
import { createLogger } from './production/logger.js';
import { createAuth, createRateLimiter, cors, requestContext, securityHeaders } from './production/security.js';
import { createHealth } from './production/health.js';
import { increment, observe, renderPrometheus } from './production/metrics.js';
import { scanFile } from './production/antivirus.js';

function normalizeExtension(filename) { return path.extname(filename || '').toLowerCase(); }
function safeStoredName(filename) { return `${randomUUID()}${normalizeExtension(filename)}`; }

export async function createApp(overrides = {}) {
  const config = {
    ...cadConfig,
    ...overrides,
    allowedExtensions: [...STEP_EXTENSIONS],
    contact: { ...cadConfig.contact, ...overrides.contact },
    features: { ...cadConfig.features, ...overrides.features },
    viewer: { ...cadConfig.viewer, ...overrides.viewer },
  };
  if (overrides.uploadDir && !overrides.databasePath) config.databasePath = path.join(overrides.uploadDir, '.runtime', 'profigym.sqlite');
  if (overrides.uploadDir && !overrides.calculationStoragePath) config.calculationStoragePath = path.join(overrides.uploadDir, '.runtime', 'storage');
  await ensureProductionDirectories(config);
  const jobStore = configureJobStore(config.databasePath);
  const logger = createLogger({ service: 'app', environment: config.environment, applicationVersion: config.applicationVersion, level: config.logLevel, format: config.logFormat, redactFields: config.logRedactFields });
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(requestContext(config));
  app.use(securityHeaders(config));
  app.use(cors(config));
  app.use((req, res, next) => {
    const started = performance.now();
    res.on('finish', () => {
      const route = req.path.startsWith('/api/cad/jobs/') ? '/api/cad/jobs/:id' : req.path.startsWith('/api/cad/calculations/') ? '/api/cad/calculations/:id' : req.path;
      increment('http_requests_total', { method: req.method, route, status_class: `${Math.floor(res.statusCode / 100)}xx` });
      observe('http_request_duration_seconds', { method: req.method, route }, (performance.now() - started) / 1000);
      if (/report(?:\.|\/|$)/.test(req.path)) observe('cad_report_duration_seconds', {}, (performance.now() - started) / 1000);
      logger.info('http_request_completed', { requestId: req.requestId, correlationId: req.correlationId, method: req.method, route, statusCode: res.statusCode, durationMs: Number((performance.now() - started).toFixed(3)) });
    });
    next();
  });
  app.use(express.json({ limit: config.maxJsonBodyBytes }));
  const auth = createAuth(config);
  const rateLimit = createRateLimiter(config);
  const health = createHealth(config);

  app.get('/health/live', health.live);
  app.get('/health/ready', health.ready);
  app.get('/health/startup', health.startup);
  app.get('/api/health', health.live);
  app.get('/api/auth/status', (req, res) => res.json({ enabled: auth.enabled, authenticated: auth.authenticated(req) }));
  app.post('/api/auth/login', rateLimit('login'), auth.login);
  app.post('/api/auth/logout', (_req, res) => { res.setHeader('Set-Cookie', 'profigym_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'); res.status(204).end(); });
  app.get('/metrics', auth.requireMetricsAuth, (_req, res) => res.type('text/plain; version=0.0.4').send(renderPrometheus(config)));
  app.use('/api/cad', auth.requireAuth);
  app.use('/api/cad', (req, res, next) => rateLimit(req.method === 'GET' ? 'read' : req.path.includes('report') ? 'report' : req.path.includes('recalculate') ? 'recalculate' : req.path.includes('import') || req.path.includes('jobs') ? 'upload' : 'write')(req, res, next));
  app.use('/api/cad', (req, _res, next) => { if (req.path.includes('report')) req.setTimeout(config.reportTimeoutMs); next(); });

  const upload = multer({
    storage: multer.diskStorage({ destination: (_req, _file, cb) => cb(null, config.uploadDir), filename: (_req, file, cb) => cb(null, safeStoredName(file.originalname)) }),
    limits: { fileSize: config.maxFileSizeBytes + 1, files: 1 },
  }).single('file');

  app.get('/api/cad/config', (_req, res) => res.json({
    applicationVersion: config.applicationVersion,
    allowedExtensions: config.allowedExtensions,
    allowedMimeTypes: STEP_MIME_TYPES,
    maxFileSizeBytes: config.maxFileSizeBytes,
    contactTolerances: config.contact,
    featureRules: config.features,
  }));

  const getJobHandler = (req, res, next) => {
    const job = getJob(req.params.id);
    if (!job) return next(new ApiError(404, 'JOB_NOT_FOUND', 'Задание не найдено'));
    res.json({ job: publicJob(job), status: job.status, area: job.area, diagnostics: job.diagnostics });
  };

  app.get('/api/cad/job/:id', getJobHandler);
  app.get('/api/cad/jobs/:id', getJobHandler);
  app.delete('/api/cad/jobs/:id', (req, res, next) => {
    const job = requestJobCancellation(req.params.id);
    if (!job) return next(new ApiError(404, 'JOB_NOT_FOUND', 'Задание не найдено'));
    res.status(job.status === 'cancelled' ? 200 : 202).json({ job: publicJob(job) });
  });
  app.get('/api/cad/report/:id', (req, res, next) => {
    const job = getJob(req.params.id);
    if (!job) return next(new ApiError(404, 'JOB_NOT_FOUND', 'Задание не найдено'));
    if (!job.report) return next(new ApiError(409, 'REPORT_NOT_READY', 'Диагностический отчет еще не готов', { status: job.status }));
    res.json({ report: job.report });
  });
  app.get('/api/cad/report/:id/viewer-mesh', (req, res, next) => {
    const job = getJob(req.params.id);
    if (!job) return next(new ApiError(404, 'JOB_NOT_FOUND', 'Задание не найдено'));
    if (job.status !== 'completed' || !job.viewerMesh) return next(new ApiError(409, 'VIEWER_MESH_NOT_READY', 'Сетка для просмотра ещё не готова'));
    res.status(job.viewerMesh.available ? 200 : 409).json({ mesh: job.viewerMesh });
  });

  const completedJobWithContact = (req) => {
    const job = getJob(req.params.id);
    if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', 'Задание не найдено');
    if (job.status !== 'completed' || !job.contactSummary) {
      throw new ApiError(409, 'JOB_NOT_COMPLETED', 'Контакты доступны только после успешного завершения задания', { status: job.status });
    }
    const contact = req.params.contactId
      ? job.contacts.find((candidate) => candidate.contactId === req.params.contactId)
      : null;
    if (req.params.contactId && !contact) {
      throw new ApiError(404, 'CONTACT_NOT_FOUND', 'Контакт не найден', { contactId: req.params.contactId });
    }
    return { job, contact };
  };

  const completedJobWithFeature = (req) => {
    const job = getJob(req.params.id);
    if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', 'Задание не найдено');
    if (job.status !== 'completed' || !job.featureSummary) {
      throw new ApiError(409, 'JOB_NOT_COMPLETED', 'Технологические элементы доступны только после успешного завершения задания', { status: job.status });
    }
    const feature = req.params.featureId
      ? job.features.find((candidate) => candidate.featureId === req.params.featureId)
      : null;
    if (req.params.featureId && !feature) {
      throw new ApiError(404, 'FEATURE_NOT_FOUND', 'Технологический элемент не найден', { featureId: req.params.featureId });
    }
    return { job, feature };
  };

  async function persistStage4(job, changes = {}) {
    const contacts = changes.contacts ?? job.contacts;
    const contactSummary = changes.contactSummary ?? job.contactSummary;
    const state = await refreshStage4JobState(job, {
      contacts,
      contactSummary,
      features: changes.features ?? job.features,
      rules: changes.featureRules ?? job.featureRules,
      statistics: job.featureStatistics,
    });
    const publicContacts = publicContactsResult({
      contacts,
      summary: contactSummary,
      statistics: job.contactStatistics,
    });
    const publicFeatures = publicFeaturesResult({
      features: state.features,
      summary: state.featureSummary,
      statistics: state.featureStatistics,
    });
    const diagnostics = {
      ...job.diagnostics,
      contacts: publicContacts,
      features: publicFeatures,
      exclusions: publicFeatures.summary,
    };
    const viewerMesh = recolorViewerMesh(job.viewerMesh, contacts, state.features, state.featureRules.areaToleranceMm2);
    const report = {
      ...job.report,
      generatedAt: new Date().toISOString(),
      paintableArea: state.featureSummary.paintableArea,
      diagnostics,
      contacts: publicContacts.contacts,
      contactSummary,
      features: publicFeatures.features,
      featureSummary: publicFeatures.summary,
      featureRules: publicRuleConfig(state.featureRules),
    };
    return updateJob(job.id, {
      contacts,
      contactSummary,
      ...state,
      paintableArea: state.featureSummary.paintableArea,
      diagnostics,
      report,
      viewerMesh,
    });
  }

  app.get('/api/cad/report/:id/contacts', (req, res, next) => {
    try {
      const { job } = completedJobWithContact(req);
      res.json(publicContactsResult({
        contacts: job.contacts,
        summary: job.contactSummary,
        statistics: job.contactStatistics,
      }));
    } catch (error) {
      next(error);
    }
  });

  async function decideContact(req, res, next, decision) {
    try {
      const { job, contact } = completedJobWithContact(req);
      if (decision === 'reset' && !contact.manualDecision) {
        throw new ApiError(409, 'INVALID_CONTACT_DECISION', 'Для контакта нет ручного решения, которое можно сбросить');
      }
      if (decision === 'confirm' && contact.initialStatus === 'rejected') {
        throw new ApiError(409, 'INVALID_CONTACT_DECISION', 'Контакт с нулевой площадью или подтвержденным зазором нельзя исключить');
      }

      const contacts = job.contacts.map((candidate) => {
        if (candidate.contactId !== contact.contactId) return candidate;
        if (decision === 'reset') {
          return { ...candidate, status: candidate.initialStatus, manualDecision: null };
        }
        const status = decision === 'confirm' ? 'confirmed' : 'rejected';
        return { ...candidate, status, manualDecision: status };
      });
      const summary = await recalculateContactSummary(
        contacts,
        job.diagnostics.totalArea.mm2,
        config.contact.areaToleranceMm2,
      );
      const updated = await persistStage4(job, { contacts, contactSummary: summary });
      res.json(publicContactsResult({
        contacts: updated.contacts,
        summary: updated.contactSummary,
        statistics: updated.contactStatistics,
      }));
    } catch (error) {
      next(error);
    }
  }

  app.post('/api/cad/report/:id/contacts/:contactId/confirm', (req, res, next) => {
    void decideContact(req, res, next, 'confirm');
  });
  app.post('/api/cad/report/:id/contacts/:contactId/reject', (req, res, next) => {
    void decideContact(req, res, next, 'reject');
  });
  app.post('/api/cad/report/:id/contacts/:contactId/reset', (req, res, next) => {
    void decideContact(req, res, next, 'reset');
  });

  app.get('/api/cad/report/:id/features', (req, res, next) => {
    try {
      const { job } = completedJobWithFeature(req);
      res.json(publicFeaturesResult({
        features: job.features,
        summary: job.featureSummary,
        statistics: job.featureStatistics,
      }));
    } catch (error) {
      next(error);
    }
  });

  async function decideFeature(req, res, next, decision) {
    try {
      const { job, feature } = completedJobWithFeature(req);
      if (feature.featureType === 'manual_feature') {
        throw new ApiError(409, 'INVALID_FEATURE_DECISION', 'Ручное исключение удаляется отдельной командой');
      }
      if (decision === 'reset' && !feature.manualDecision) {
        throw new ApiError(409, 'INVALID_FEATURE_DECISION', 'Для элемента нет ручного решения, которое можно сбросить');
      }
      let features = job.features.map((candidate) => {
        if (candidate.featureId !== feature.featureId) return candidate;
        if (decision === 'reset') return { ...candidate, manualDecision: null };
        const manualDecision = decision === 'confirm' ? 'manually_confirmed' : 'manually_rejected';
        return { ...candidate, manualDecision, status: manualDecision };
      });
      features = reclassifyFeatures(features, job.featureRules, job.faceCatalog);
      const updated = await persistStage4(job, { features });
      res.json(publicFeaturesResult({
        features: updated.features,
        summary: updated.featureSummary,
        statistics: updated.featureStatistics,
      }));
    } catch (error) {
      next(error);
    }
  }

  app.post('/api/cad/report/:id/features/:featureId/confirm', (req, res, next) => {
    void decideFeature(req, res, next, 'confirm');
  });
  app.post('/api/cad/report/:id/features/:featureId/reject', (req, res, next) => {
    void decideFeature(req, res, next, 'reject');
  });
  app.post('/api/cad/report/:id/features/:featureId/reset', (req, res, next) => {
    void decideFeature(req, res, next, 'reset');
  });

  app.post('/api/cad/report/:id/features/manual', (req, res, next) => {
    void (async () => {
      try {
        const { job } = completedJobWithFeature(req);
        const faceIds = req.body?.faceIds;
        if (!Array.isArray(faceIds) || faceIds.length === 0 || faceIds.some((id) => typeof id !== 'string' || !id)) {
          throw new ApiError(400, 'INVALID_FACE_SELECTION', 'Передайте непустой список идентификаторов граней');
        }
        const uniqueIds = [...new Set(faceIds)].sort();
        const known = new Set(job.faceCatalog.map((face) => face.id));
        const unknown = uniqueIds.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          throw new ApiError(400, 'INVALID_FACE_SELECTION', 'Выбраны неизвестные грани', { faceIds: unknown });
        }
        const duplicate = job.features.find((feature) => feature.faceIds.length === uniqueIds.length
          && [...feature.faceIds].sort().every((id, index) => id === uniqueIds[index]));
        if (duplicate) {
          throw new ApiError(409, 'MANUAL_FEATURE_CONFLICT', 'Такой набор граней уже образует технологический элемент', { featureId: duplicate.featureId });
        }
        const manual = createManualFeature(job.id, uniqueIds, job.faceCatalog);
        const features = reclassifyFeatures([...job.features, manual], job.featureRules, job.faceCatalog);
        const updated = await persistStage4(job, { features });
        res.status(201).json(publicFeaturesResult({
          features: updated.features,
          summary: updated.featureSummary,
          statistics: updated.featureStatistics,
        }));
      } catch (error) {
        next(error);
      }
    })();
  });

  app.delete('/api/cad/report/:id/features/:featureId', (req, res, next) => {
    void (async () => {
      try {
        const { job, feature } = completedJobWithFeature(req);
        if (feature.featureType !== 'manual_feature') {
          throw new ApiError(409, 'INVALID_FEATURE_DECISION', 'Удалять можно только ручные исключения');
        }
        const features = job.features.filter((candidate) => candidate.featureId !== feature.featureId);
        const updated = await persistStage4(job, { features });
        res.json(publicFeaturesResult({
          features: updated.features,
          summary: updated.featureSummary,
          statistics: updated.featureStatistics,
        }));
      } catch (error) {
        next(error);
      }
    })();
  });

  app.get('/api/cad/report/:id/feature-rules', (req, res, next) => {
    try {
      const { job } = completedJobWithFeature(req);
      res.json({ rules: publicRuleConfig(job.featureRules) });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/cad/report/:id/feature-rules', (req, res, next) => {
    void (async () => {
      try {
        const { job } = completedJobWithFeature(req);
        let rules;
        try {
          rules = mergeFeatureRules(job.featureRules, req.body);
        } catch (error) {
          throw new ApiError(400, 'INVALID_FEATURE_RULES', error.message);
        }
        const features = reclassifyFeatures(job.features, rules, job.faceCatalog);
        const updated = await persistStage4(job, { features, featureRules: rules });
        res.json({
          rules: publicRuleConfig(rules),
          result: publicFeaturesResult({
            features: updated.features,
            summary: updated.featureSummary,
            statistics: updated.featureStatistics,
          }),
        });
      } catch (error) {
        next(error);
      }
    })();
  });

  const importHandler = (req, res, next) => {
    const uploadStarted = performance.now();
    upload(req, res, async (uploadError) => {
      try {
        if (uploadError) {
          if (uploadError.code === 'LIMIT_FILE_SIZE') throw new ApiError(413, 'FILE_TOO_LARGE', `Размер файла превышает ${config.maxFileSizeBytes} байт`);
          throw new ApiError(400, 'UPLOAD_FAILED', 'Не удалось загрузить файл');
        }
        if (!req.file) throw new ApiError(400, 'FILE_REQUIRED', 'Выберите CAD-файл');
        if (req.file.size > config.maxFileSizeBytes) {
          await fs.rm(req.file.path, { force: true });
          throw new ApiError(413, 'FILE_TOO_LARGE', `Размер файла превышает ${config.maxFileSizeBytes} байт`);
        }
        const extension = normalizeExtension(req.file.originalname);
        if (!config.allowedExtensions.includes(extension)) {
          await fs.rm(req.file.path, { force: true });
          throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Поддерживаемые форматы: STEP (.stp, .step)');
        }
        if (!isAllowedStepMimeType(req.file.mimetype)) {
          await fs.rm(req.file.path, { force: true });
          throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Содержимое загрузки не распознано как STEP', { mimeType: req.file.mimetype });
        }
        if (req.file.size === 0) {
          await fs.rm(req.file.path, { force: true });
          throw new ApiError(400, 'EMPTY_FILE', 'Файл пуст');
        }
        const antivirus = await scanFile(req.file.path, config);
        if (antivirus.status === 'infected') {
          await fs.rm(req.file.path, { force: true });
          throw new ApiError(422, 'MALWARE_DETECTED', 'Файл отклонён антивирусной проверкой');
        }
        const job = createJob({
          originalName: path.basename(req.file.originalname),
          storedName: req.file.filename,
          size: req.file.size,
          extension,
          uploadMs: Number((performance.now() - uploadStarted).toFixed(3)),
          correlationId: req.correlationId,
          maxAttempts: config.jobMaxAttempts,
          idempotencyKey: req.get('idempotency-key') || null,
        });
        increment('cad_upload_bytes', {}, job.size);
        logger.info('cad_upload_created', { requestId: req.requestId, correlationId: req.correlationId, jobId: job.id, extension, size: job.size, antivirusStatus: antivirus.status });
        if (config.processingMode === 'inline') setImmediate(() => {
          processCadJob(job.id, config).catch((error) => logger.error('cad_job_unhandled_error', { jobId: job.id, correlationId: req.correlationId, errorCode: error.code, message: error.message, stack: error.stack }));
        });
        res.status(202).json({ job: publicJob(job), statusUrl: `/api/cad/job/${job.id}`, reportUrl: `/api/cad/report/${job.id}` });
      } catch (error) { next(error); }
    });
  };

  app.post('/api/cad/import', importHandler);
  app.post('/api/cad/jobs', importHandler);
  const calculations = createCalculationRouter(config);
  app.use('/api/cad/calculations', calculations.router);
  if (config.environment === 'production') {
    app.use(express.static(config.frontendDistPath, { index: false, fallthrough: true, maxAge: '1h' }));
    app.get('*splat', (_req, res, next) => res.sendFile(path.join(config.frontendDistPath, 'index.html'), (error) => error ? next(error) : undefined));
  }
  app.use((error, req, res, _next) => {
    const featureCodes = new Set([
      'FEATURE_GEOMETRY_FAILED',
      'FEATURE_AREA_OVERFLOW',
      'FEATURE_OVERLAP_FAILED',
    ]);
    const apiError = error instanceof ApiError
      ? error
      : error?.type === 'entity.too.large'
        ? new ApiError(413, 'REQUEST_TOO_LARGE', 'Размер JSON-запроса превышает допустимый лимит')
      : featureCodes.has(error?.code)
        ? new ApiError(422, error.code, error.message, error.details ?? null)
        : new ApiError(500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
    logger.error('cad_api_error', { requestId: req.requestId, correlationId: req.correlationId, statusCode: apiError.status, errorCode: apiError.code, message: error.message, stack: error.stack });
    res.status(apiError.status).json(errorPayload(apiError, req.requestId));
  });
  return { app, config, calculationRepository: calculations.repository, jobStore, logger };
}
