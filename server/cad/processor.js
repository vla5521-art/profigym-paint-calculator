import path from 'node:path';
import { getCadImporter } from './importers/index.js';
import { getJob, updateJob } from '../jobs.js';
import { areaUnits } from './units.js';
import { emptyFeatureResult, publicFeaturesResult } from './features/service.js';
import { publicContactsResult } from './contacts/service.js';
import { increment, observe } from '../production/metrics.js';

function roundMs(value) {
  return Number(value.toFixed(3));
}

function assertStageTimeout(duration, limit, code, label) {
  if (Number(duration ?? 0) > limit) throw Object.assign(new Error(`Превышен timeout этапа ${label}`), { code, details: { durationMs: duration, limitMs: limit } });
}

export async function processCadJob(jobId, config) {
  const job = getJob(jobId);
  if (!job) return null;
  const started = performance.now();
  if (job.cancelRequested) return updateJob(jobId, { status: 'cancelled', errorCode: 'JOB_CANCELLED', publicError: 'Задание отменено' });
  updateJob(jobId, { status: 'processing', startedAt: job.startedAt ?? new Date().toISOString() });
  const originalPath = path.join(config.uploadDir, job.storedName);

  try {
    if (config.testProcessingDelayMs > 0 && job.originalName === config.testTimeoutFixtureName) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(config.testProcessingDelayMs, config.jobTimeoutMs)));
      if (config.testProcessingDelayMs >= config.jobTimeoutMs) {
        const timeout = new Error('Превышено допустимое время обработки CAD-модели');
        timeout.code = 'CAD_PROCESSING_TIMEOUT';
        throw timeout;
      }
    }
    const importer = getCadImporter(job.extension);
    if (Date.now() >= Date.parse(getJob(jobId)?.timeoutAt ?? new Date(Date.now() + config.jobTimeoutMs).toISOString())) {
      throw Object.assign(new Error('Превышено допустимое время обработки CAD-модели'), { code: 'CAD_PROCESSING_TIMEOUT' });
    }
    const result = await importer.importFile(originalPath, job.originalName, {
      contactConfig: config.contact,
      featureConfig: config.features,
      viewerConfig: config.viewer,
    });
    assertStageTimeout(result.diagnostics.performance.importMs, config.importTimeoutMs, 'CAD_IMPORT_TIMEOUT', 'STEP import');
    assertStageTimeout(result.contactResult.statistics?.totalContactProcessingMs, config.contactTimeoutMs, 'CAD_CONTACT_TIMEOUT', 'contacts');
    assertStageTimeout(result.featureResult.statistics?.totalFeatureProcessingMs, config.featureTimeoutMs, 'CAD_FEATURE_TIMEOUT', 'features');
    assertStageTimeout(result.viewerMesh?.statistics?.generationMs, config.viewerTimeoutMs, 'CAD_VIEWER_TIMEOUT', 'viewer');
    const current = getJob(jobId);
    if (current?.cancelRequested) throw Object.assign(new Error('Задание отменено между этапами CAD-обработки'), { code: 'JOB_CANCELLED' });
    if (current?.timeoutAt && Date.now() >= Date.parse(current.timeoutAt)) throw Object.assign(new Error('Превышено допустимое время обработки CAD-модели'), { code: 'CAD_PROCESSING_TIMEOUT' });
    const totalMs = performance.now() - started;
    result.diagnostics.performance.uploadMs = job.performance.uploadMs;
    result.diagnostics.performance.totalMs = roundMs(totalMs + job.performance.uploadMs);

    const report = {
      id: job.id,
      status: result.ok ? 'completed' : 'failed',
      generatedAt: new Date().toISOString(),
      source: { name: job.originalName, sizeBytes: job.size, format: job.extension },
      area: result.diagnostics.totalArea,
      paintableArea: result.featureResult.summary.paintableArea,
      diagnostics: result.diagnostics,
      contacts: result.diagnostics.contacts.contacts,
      contactSummary: result.diagnostics.contacts.summary,
      contactStatistics: result.contactResult.statistics,
      features: result.diagnostics.features.features,
      featureSummary: result.diagnostics.features.summary,
      featureStatistics: result.featureResult.statistics,
      featureRules: config.features,
      viewerMesh: result.viewerMesh,
    };

    observe('cad_job_duration_seconds', { job_type: job.jobType }, totalMs / 1000);
    observe('cad_step_import_duration_seconds', {}, (result.diagnostics.performance.importMs ?? 0) / 1000);
    observe('cad_contact_duration_seconds', {}, (result.contactResult.statistics?.totalContactProcessingMs ?? 0) / 1000);
    observe('cad_feature_duration_seconds', {}, (result.featureResult.statistics?.totalFeatureProcessingMs ?? 0) / 1000);
    observe('cad_viewer_duration_seconds', {}, (result.viewerMesh?.statistics?.generationMs ?? 0) / 1000);
    increment(result.ok ? 'cad_jobs_completed_total' : 'cad_jobs_failed_total', { job_type: job.jobType });
    return updateJob(jobId, {
      status: result.ok ? 'completed' : 'failed',
      errorCode: result.ok ? null : result.diagnostics.errors[0]?.code ?? 'CAD_PROCESSING_FAILED',
      publicError: result.ok ? null : result.diagnostics.errors[0]?.message ?? 'CAD processing failed',
      internalErrorReference: result.ok ? null : `${job.correlationId}:${job.id}`,
      error: result.ok ? null : result.diagnostics.errors[0],
      area: result.diagnostics.totalArea,
      paintableArea: result.featureResult.summary.paintableArea,
      diagnostics: result.diagnostics,
      contacts: result.contactResult.contacts,
      contactSummary: result.contactResult.summary,
      contactStatistics: result.contactResult.statistics,
      features: result.featureResult.features,
      featureSummary: result.featureResult.summary,
      featureStatistics: result.featureResult.statistics,
      featureRules: config.features,
      faceCatalog: result.featureResult.faceCatalog,
      viewerMesh: result.viewerMesh,
      report,
      performance: result.diagnostics.performance,
    });
  } catch (error) {
    const issue = {
      code: error?.code || 'CAD_PROCESSING_FAILED',
      message: error instanceof Error ? error.message : 'Ошибка обработки CAD-модели',
      details: error?.details ?? null,
    };
    const totalMs = roundMs(performance.now() - started + job.performance.uploadMs);
    const emptyContact = {
      contacts: [],
      summary: {
        totalAreaMm2: 0, confirmedPhysicalContactAreaMm2: 0, confirmedExcludedPaintAreaMm2: 0,
        reviewRequiredPhysicalAreaMm2: 0, paintableAreaMm2: 0, totalArea: areaUnits(0),
        confirmedPhysicalContactArea: areaUnits(0), confirmedExcludedPaintArea: areaUnits(0),
        reviewRequiredPhysicalArea: areaUnits(0), paintableArea: areaUnits(0),
      },
      statistics: { bodyCount: 0, potentialBodyPairCount: 0, broadPhaseBodyPairCount: 0, narrowPhaseCandidateCount: 0, exactCheckCount: 0, broadPhaseMs: 0, narrowPhaseMs: 0, classificationMs: 0, totalContactProcessingMs: 0 },
    };
    const emptyFeatures = emptyFeatureResult();
    const diagnostics = {
      sourceName: job.originalName,
      kernel: 'Open Cascade Technology 8 (occt-wasm 3.8.1)',
      counts: { bodies: 0, shells: 0, faces: 0, edges: 0, vertices: 0 },
      units: { source: 'unknown', symbol: 'mm', millimetersPerUnit: 1, normalizedTo: 'mm', assumed: true },
      totalArea: { mm2: 0, cm2: 0, m2: 0 },
      bodies: [],
      faces: [],
      warnings: [],
      errors: [issue],
      validation: { isValid: false, openShellCount: 0, multiBody: false },
      contacts: publicContactsResult(emptyContact),
      features: publicFeaturesResult(emptyFeatures),
      exclusions: emptyFeatures.summary,
      performance: { uploadMs: job.performance.uploadMs, importMs: 0, calculationMs: 0, totalMs },
    };
    const status = issue.code === 'JOB_CANCELLED' ? 'cancelled' : issue.code === 'CAD_PROCESSING_TIMEOUT' ? 'timed_out' : 'failed';
    increment(status === 'timed_out' ? 'cad_jobs_timed_out_total' : 'cad_jobs_failed_total', { job_type: job.jobType });
    return updateJob(jobId, {
      status,
      errorCode: issue.code,
      publicError: issue.message,
      internalErrorReference: `${job.correlationId}:${job.id}`,
      error: issue,
      area: diagnostics.totalArea,
      diagnostics,
      report: {
        id: job.id,
        status: 'failed',
        generatedAt: new Date().toISOString(),
        source: { name: job.originalName, sizeBytes: job.size, format: job.extension },
        area: diagnostics.totalArea,
        paintableArea: diagnostics.totalArea,
        diagnostics,
        contacts: [],
        contactSummary: emptyContact.summary,
        contactStatistics: emptyContact.statistics,
        features: [],
        featureSummary: emptyFeatures.summary,
        featureStatistics: emptyFeatures.statistics,
      },
      performance: diagnostics.performance,
    });
  }
}
