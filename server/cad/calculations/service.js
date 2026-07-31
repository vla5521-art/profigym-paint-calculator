import { analyzeStepContent } from '../kernel.js';
import { recalculateContactSummary, publicContactsResult } from '../contacts/service.js';
import { createManualFeature, publicFeaturesResult, reclassifyFeatures, refreshStage4JobState } from '../features/service.js';
import { recolorViewerMesh } from '../viewer/service.js';

export function assertCanonicalSummary(summary, tolerance = 0.01) {
  const expectedPaintable = summary.totalAreaMm2 - summary.uniqueConfirmedExcludedAreaMm2;
  const expectedUnique = summary.rawExcludedAreaMm2 - summary.overlapAreaMm2;
  if (Math.abs(summary.paintableAreaMm2 - expectedPaintable) > tolerance || Math.abs(summary.uniqueConfirmedExcludedAreaMm2 - expectedUnique) > tolerance) {
    throw Object.assign(new Error('Нарушены инварианты итоговой площади'), { code: 'CALCULATION_AREA_INCONSISTENT' });
  }
  return summary;
}

export function publicCalculation(record) {
  if (!record) return null;
  const payload = record.payload;
  const contacts = publicContactsResult({ contacts: payload.contacts, summary: payload.contactSummary, statistics: payload.contactStatistics });
  const features = publicFeaturesResult({ features: payload.features, summary: payload.featureSummary, statistics: payload.featureStatistics });
  return {
    calculationId: record.id,
    name: record.name,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sourceFileName: record.sourceFileName,
    sourceFileHash: record.sourceFileHash,
    sourceFileSize: record.sourceFileSize,
    revisionNumber: record.revisionNumber,
    applicationVersion: record.applicationVersion,
    algorithmVersion: record.algorithmVersion,
    versions: payload.versions,
    diagnostics: payload.diagnostics,
    contacts: contacts.contacts,
    contactSummary: contacts.summary,
    features: features.features,
    featureSummary: features.summary,
    featureRules: payload.featureRules,
    contactSettings: payload.contactSettings,
    warnings: payload.warnings,
    paintIntegration: payload.paintIntegration,
    preview: payload.preview ? { available: true, mime: payload.preview.mime, width: payload.preview.width, height: payload.preview.height, sizeBytes: payload.preview.sizeBytes, url: `/api/cad/calculations/${record.id}/preview` } : { available: false },
    viewerMeshUrl: `/api/cad/calculations/${record.id}/viewer-mesh`,
    reportJsonUrl: `/api/cad/calculations/${record.id}/report.json`,
    reportHtmlUrl: `/api/cad/calculations/${record.id}/report.html`,
  };
}

function restoreDecisions(oldPayload, result, options) {
  const preserveReview = options.preserveReviewDecisions !== false;
  const oldContacts = new Map(oldPayload.contacts.map((item) => [item.contactId, item]));
  const contacts = result.contactResult.contacts.map((item) => {
    const old = oldContacts.get(item.contactId);
    if (!preserveReview || !old?.manualDecision) return item;
    return { ...item, status: old.manualDecision, manualDecision: old.manualDecision };
  });
  const oldFeatures = new Map(oldPayload.features.filter((item) => item.featureType !== 'manual_feature').map((item) => [item.featureId, item]));
  let features = result.featureResult.features.map((item) => {
    const old = oldFeatures.get(item.featureId);
    if (!preserveReview || !old?.manualDecision) return item;
    return { ...item, status: old.manualDecision, manualDecision: old.manualDecision };
  });
  const unmatchedDecisions = [];
  if (preserveReview) {
    for (const old of oldPayload.contacts.filter((item) => item.manualDecision)) if (!contacts.some((item) => item.contactId === old.contactId)) unmatchedDecisions.push({ entityType: 'contact', entityId: old.contactId });
    for (const old of oldPayload.features.filter((item) => item.manualDecision && item.featureType !== 'manual_feature')) if (!features.some((item) => item.featureId === old.featureId)) unmatchedDecisions.push({ entityType: 'feature', entityId: old.featureId });
  }
  if (options.preserveManualDecisions !== false) {
    const knownFaces = new Set(result.featureResult.faceCatalog.map((face) => face.id));
    for (const old of oldPayload.features.filter((item) => item.featureType === 'manual_feature')) {
      if (old.faceIds.every((id) => knownFaces.has(id))) features.push(createManualFeature('recalculation', old.faceIds, result.featureResult.faceCatalog));
      else unmatchedDecisions.push({ entityType: 'manual_feature', entityId: old.featureId });
    }
  }
  return { contacts, features, unmatchedDecisions };
}

export async function recalculateCalculation(repository, record, options, config) {
  const source = await repository.readSource(record);
  const contactSettings = { ...record.payload.contactSettings, ...(options.contactSettings ?? {}) };
  const featureRules = { ...record.payload.featureRules, ...(options.featureRules ?? {}) };
  const result = await analyzeStepContent(source, record.sourceFileName, { contactConfig: contactSettings, featureConfig: featureRules, viewerConfig: config.viewer });
  if (!result.ok) throw Object.assign(new Error(result.diagnostics.errors[0]?.message ?? 'Повторный расчёт не выполнен'), { code: 'CALCULATION_RECALCULATION_FAILED' });
  const restored = restoreDecisions(record.payload, result, options);
  const contactSummary = await recalculateContactSummary(restored.contacts, result.diagnostics.totalArea.mm2, contactSettings.areaToleranceMm2);
  const features = reclassifyFeatures(restored.features, featureRules, result.featureResult.faceCatalog);
  const state = await refreshStage4JobState({
    contacts: restored.contacts,
    contactSummary,
    features,
    featureRules,
    faceCatalog: result.featureResult.faceCatalog,
    featureStatistics: result.featureResult.statistics,
    diagnostics: result.diagnostics,
  }, { contacts: restored.contacts, contactSummary, features, rules: featureRules, statistics: result.featureResult.statistics });
  assertCanonicalSummary(state.featureSummary, featureRules.areaToleranceMm2);
  const publicContacts = publicContactsResult({ contacts: restored.contacts, summary: contactSummary, statistics: result.contactResult.statistics });
  const publicFeatures = publicFeaturesResult({ features, summary: state.featureSummary, statistics: state.featureStatistics });
  const diagnostics = { ...result.diagnostics, contacts: publicContacts, features: publicFeatures, exclusions: publicFeatures.summary };
  const payload = {
    ...record.payload,
    diagnostics,
    contacts: restored.contacts,
    contactSummary,
    contactStatistics: result.contactResult.statistics,
    features,
    featureSummary: state.featureSummary,
    featureStatistics: state.featureStatistics,
    featureRules,
    contactSettings,
    faceCatalog: result.featureResult.faceCatalog,
    warnings: [...result.diagnostics.warnings, ...restored.unmatchedDecisions.map((entry) => ({ code: 'DECISION_RESTORE_CONFLICT', message: `Решение не восстановлено: ${entry.entityId}`, details: entry }))],
  };
  return repository.update(record.id, {
    payload,
    mesh: recolorViewerMesh(result.viewerMesh, restored.contacts, features, featureRules.areaToleranceMm2),
    revisionReason: 'recalculation',
    revisionSettings: { contactSettings, featureRules, preserveManualDecisions: options.preserveManualDecisions !== false, preserveReviewDecisions: options.preserveReviewDecisions !== false },
  });
}

export async function applyBulkDecision(repository, record, { entityType, ids, decision }) {
  if (!['contact', 'feature'].includes(entityType) || !['confirm', 'reject', 'reset'].includes(decision) || !Array.isArray(ids) || ids.length === 0) {
    throw Object.assign(new Error('Некорректное массовое решение'), { code: 'INVALID_FEATURE_DECISION' });
  }
  const payload = structuredClone(record.payload);
  if (entityType === 'contact') {
    const selected = new Set(ids);
    payload.contacts = payload.contacts.map((item) => {
      if (!selected.has(item.contactId)) return item;
      const status = decision === 'reset' ? item.initialStatus : decision === 'confirm' ? 'confirmed' : 'rejected';
      repository.recordDecision(record.id, { action: decision, entityType, entityId: item.contactId, previousStatus: item.status, newStatus: status });
      return { ...item, status, manualDecision: decision === 'reset' ? null : status };
    });
    payload.contactSummary = await recalculateContactSummary(payload.contacts, payload.diagnostics.totalArea.mm2, payload.contactSettings.areaToleranceMm2);
  } else {
    const selected = new Set(ids);
    payload.features = payload.features.map((item) => {
      if (!selected.has(item.featureId) || item.featureType === 'manual_feature') return item;
      const status = decision === 'reset' ? item.initialStatus : decision === 'confirm' ? 'manually_confirmed' : 'manually_rejected';
      repository.recordDecision(record.id, { action: decision, entityType, entityId: item.featureId, previousStatus: item.status, newStatus: status });
      return { ...item, status, manualDecision: decision === 'reset' ? null : status };
    });
    payload.features = reclassifyFeatures(payload.features, payload.featureRules, payload.faceCatalog);
  }
  const state = await refreshStage4JobState({ ...payload }, { contacts: payload.contacts, contactSummary: payload.contactSummary, features: payload.features, rules: payload.featureRules, statistics: payload.featureStatistics });
  payload.featureSummary = state.featureSummary;
  payload.featureStatistics = state.featureStatistics;
  payload.diagnostics = { ...payload.diagnostics, contacts: publicContactsResult({ contacts: payload.contacts, summary: payload.contactSummary, statistics: payload.contactStatistics }), features: publicFeaturesResult({ features: payload.features, summary: state.featureSummary, statistics: state.featureStatistics }), exclusions: state.featureSummary };
  assertCanonicalSummary(state.featureSummary, payload.featureRules.areaToleranceMm2);
  const mesh = recolorViewerMesh(await repository.readMesh(record), payload.contacts, payload.features, payload.featureRules.areaToleranceMm2);
  return repository.update(record.id, { payload, mesh });
}
