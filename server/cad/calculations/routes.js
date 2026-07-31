import express from 'express';
import multer from 'multer';
import { ApiError } from '../../errors.js';
import { getJob } from '../../jobs.js';
import { CalculationRepository } from './repository.js';
import { applyBulkDecision, publicCalculation, recalculateCalculation } from './service.js';
import { createHtmlReport, createJsonReport } from '../reports/service.js';
import { reportSchema } from '../reports/schema.js';
import { createPaintIntegration } from '../integration/paint-calculator.js';
import { createManualFeature, reclassifyFeatures, refreshStage4JobState, publicFeaturesResult } from '../features/service.js';
import { publicContactsResult } from '../contacts/service.js';
import { recolorViewerMesh } from '../viewer/service.js';
import { validatePreview } from '../reports/preview.js';

const STATUS_BY_CODE = {
  CALCULATION_NOT_FOUND: 404,
  CALCULATION_NOT_READY: 409,
  INVALID_CALCULATION_NAME: 400,
  INVALID_JOB_ID: 400,
  INVALID_FEATURE_DECISION: 400,
  INVALID_FACE_SELECTION: 400,
  MANUAL_FEATURE_CONFLICT: 409,
  CALCULATION_AREA_INCONSISTENT: 422,
  CALCULATION_RECALCULATION_FAILED: 422,
  PAINT_INTEGRATION_CONFIRMATION_REQUIRED: 409,
  PAINTABLE_AREA_INVALID: 422,
  REPORT_SCHEMA_INVALID: 500,
  INVALID_REPORT_PREVIEW: 400,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireJobId(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ApiError(400, 'INVALID_JOB_ID', 'Некорректный идентификатор задания');
  }
  return value;
}

function apiError(error, fallbackCode = 'CALCULATION_SAVE_FAILED') {
  if (error instanceof ApiError) return error;
  const code = error?.code ?? fallbackCode;
  return new ApiError(STATUS_BY_CODE[code] ?? 500, code, error instanceof Error ? error.message : 'Операция с расчётом не выполнена', error?.details ?? null);
}

function requireCalculation(repository, id) {
  const calculation = repository.get(id);
  if (!calculation) throw new ApiError(404, 'CALCULATION_NOT_FOUND', 'Сохранённый расчёт не найден');
  return calculation;
}

function listItem(record) {
  const summary = record.payload.featureSummary;
  return {
    calculationId: record.id,
    name: record.name,
    sourceFileName: record.sourceFileName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    totalArea: summary.totalArea,
    paintableArea: summary.paintableArea,
    warningCount: record.payload.warnings?.length ?? 0,
    algorithmVersion: record.algorithmVersion,
    revisionNumber: record.revisionNumber,
  };
}

async function refreshPayload(payload) {
  const state = await refreshStage4JobState({ ...payload }, {
    contacts: payload.contacts,
    contactSummary: payload.contactSummary,
    features: payload.features,
    rules: payload.featureRules,
    statistics: payload.featureStatistics,
  });
  payload.featureSummary = state.featureSummary;
  payload.featureStatistics = state.featureStatistics;
  payload.diagnostics = {
    ...payload.diagnostics,
    contacts: publicContactsResult({ contacts: payload.contacts, summary: payload.contactSummary, statistics: payload.contactStatistics }),
    features: publicFeaturesResult({ features: payload.features, summary: state.featureSummary, statistics: state.featureStatistics }),
    exclusions: state.featureSummary,
  };
  return payload;
}

export function createCalculationRouter(config) {
  const repository = new CalculationRepository(config);
  const router = express.Router();
  const previewUpload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: config.reportPreviewMaxBytes } });

  router.post('/', async (req, res, next) => {
    try {
      const jobId = requireJobId(req.body?.jobId);
      if (req.body?.name != null && typeof req.body.name !== 'string') {
        throw new ApiError(400, 'INVALID_CALCULATION_NAME', 'Название расчёта должно быть строкой');
      }
      const job = getJob(jobId);
      if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', 'Задание для сохранения не найдено');
      const calculation = await repository.createFromJob(job, req.body?.name ?? job.originalName);
      res.status(201).json({ calculation: publicCalculation(calculation) });
    } catch (error) { next(apiError(error)); }
  });

  router.get('/', (req, res, next) => {
    try {
      const result = repository.list({ page: req.query.page, pageSize: req.query.pageSize, search: req.query.search, status: req.query.status, sort: req.query.sort });
      res.json({ ...result, items: result.items.map(listItem) });
    } catch (error) { next(apiError(error, 'CALCULATION_LIST_FAILED')); }
  });

  router.get('/report-schema.json', (_req, res) => res.json(reportSchema));

  router.get('/:id', (req, res, next) => {
    try { res.json({ calculation: publicCalculation(requireCalculation(repository, req.params.id)) }); }
    catch (error) { next(apiError(error)); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const current = requireCalculation(repository, req.params.id);
      const updated = await repository.update(current.id, { name: req.body?.name });
      res.json({ calculation: publicCalculation(updated) });
    } catch (error) { next(apiError(error)); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const deleted = await repository.delete(req.params.id);
      if (!deleted) throw new ApiError(404, 'CALCULATION_NOT_FOUND', 'Сохранённый расчёт не найден');
      res.status(204).end();
    } catch (error) { next(apiError(error, 'CALCULATION_DELETE_FAILED')); }
  });

  router.post('/:id/duplicate', async (req, res, next) => {
    try {
      requireCalculation(repository, req.params.id);
      const duplicate = await repository.duplicate(req.params.id);
      res.status(201).json({ calculation: publicCalculation(duplicate) });
    } catch (error) { next(apiError(error)); }
  });

  router.post('/:id/recalculate', async (req, res, next) => {
    try {
      const current = requireCalculation(repository, req.params.id);
      const updated = await recalculateCalculation(repository, current, req.body ?? {}, config);
      res.json({ calculation: publicCalculation(updated) });
    } catch (error) { next(apiError(error, 'CALCULATION_RECALCULATION_FAILED')); }
  });

  router.get('/:id/revisions', (req, res, next) => {
    try { requireCalculation(repository, req.params.id); res.json({ revisions: repository.revisions(req.params.id) }); }
    catch (error) { next(apiError(error)); }
  });

  router.get('/:id/viewer-mesh', async (req, res, next) => {
    try {
      const current = requireCalculation(repository, req.params.id);
      const mesh = await repository.readMesh(current);
      if (!mesh.available) res.status(409);
      res.json({ mesh });
    } catch (error) { next(apiError(error, 'VIEWER_MESH_NOT_READY')); }
  });

  router.get('/:id/report.json', (req, res, next) => {
    try { res.json(createJsonReport(requireCalculation(repository, req.params.id))); }
    catch (error) { next(apiError(error)); }
  });

  router.get('/:id/report.html', async (req, res, next) => {
    try {
      const calculation = requireCalculation(repository, req.params.id);
      const preview = await repository.readPreview(calculation);
      const dataUrl = preview ? `data:${preview.metadata.mime};base64,${preview.bytes.toString('base64')}` : null;
      res.type('html').send(createHtmlReport(calculation, dataUrl));
    }
    catch (error) { next(apiError(error)); }
  });

  router.post('/:id/preview', previewUpload.single('preview'), async (req, res, next) => {
    try {
      const calculation = requireCalculation(repository, req.params.id);
      const metadata = validatePreview(req.file?.buffer, { maxBytes: config.reportPreviewMaxBytes, maxWidth: config.reportPreviewMaxWidth, maxHeight: config.reportPreviewMaxHeight });
      const updated = await repository.writePreview(calculation, req.file.buffer, metadata);
      res.status(201).json({ preview: publicCalculation(updated).preview });
    } catch (error) { next(apiError(error)); }
  });

  router.get('/:id/preview', async (req, res, next) => {
    try {
      const calculation = requireCalculation(repository, req.params.id);
      const preview = await repository.readPreview(calculation);
      if (!preview) throw Object.assign(new Error('Preview не найден'), { code: 'INVALID_REPORT_PREVIEW' });
      res.type(preview.metadata.mime).send(preview.bytes);
    } catch (error) { next(apiError(error)); }
  });

  router.post('/:id/integrate-paint', async (req, res, next) => {
    try {
      const current = requireCalculation(repository, req.params.id);
      const integration = createPaintIntegration(current, req.body?.confirmed);
      const updated = await repository.update(current.id, { payload: { ...current.payload, paintIntegration: integration } });
      res.json({ integration, calculation: publicCalculation(updated) });
    } catch (error) { next(apiError(error)); }
  });

  router.post('/:id/decisions/bulk', async (req, res, next) => {
    try {
      const current = requireCalculation(repository, req.params.id);
      const updated = await applyBulkDecision(repository, current, req.body ?? {});
      res.json({ calculation: publicCalculation(updated) });
    } catch (error) { next(apiError(error)); }
  });

  router.post('/:id/features/manual', async (req, res, next) => {
    try {
      const current = requireCalculation(repository, req.params.id);
      const faceIds = Array.isArray(req.body?.faceIds) ? [...new Set(req.body.faceIds)].sort() : [];
      const known = new Set(current.payload.faceCatalog.map((face) => face.id));
      if (faceIds.length === 0 || faceIds.some((id) => typeof id !== 'string' || !known.has(id))) throw Object.assign(new Error('Передайте существующие face IDs'), { code: 'INVALID_FACE_SELECTION' });
      if (current.payload.features.some((feature) => feature.faceIds.length === faceIds.length && [...feature.faceIds].sort().every((id, index) => id === faceIds[index]))) throw Object.assign(new Error('Такой набор граней уже исключён'), { code: 'MANUAL_FEATURE_CONFLICT' });
      const payload = structuredClone(current.payload);
      payload.features = reclassifyFeatures([...payload.features, createManualFeature(current.id, faceIds, payload.faceCatalog)], payload.featureRules, payload.faceCatalog);
      await refreshPayload(payload);
      const mesh = recolorViewerMesh(await repository.readMesh(current), payload.contacts, payload.features, payload.featureRules.areaToleranceMm2);
      const updated = await repository.update(current.id, { payload, mesh });
      res.status(201).json({ calculation: publicCalculation(updated) });
    } catch (error) { next(apiError(error)); }
  });

  router.delete('/:id/features/:featureId', async (req, res, next) => {
    try {
      const current = requireCalculation(repository, req.params.id);
      const feature = current.payload.features.find((item) => item.featureId === req.params.featureId);
      if (!feature || feature.featureType !== 'manual_feature') throw Object.assign(new Error('Ручное исключение не найдено'), { code: 'FEATURE_NOT_FOUND' });
      const payload = structuredClone(current.payload);
      payload.features = payload.features.filter((item) => item.featureId !== feature.featureId);
      await refreshPayload(payload);
      const mesh = recolorViewerMesh(await repository.readMesh(current), payload.contacts, payload.features, payload.featureRules.areaToleranceMm2);
      const updated = await repository.update(current.id, { payload, mesh });
      res.json({ calculation: publicCalculation(updated) });
    } catch (error) { next(apiError(error)); }
  });

  return { router, repository };
}
