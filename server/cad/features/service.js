import { createHash } from 'node:crypto';
import { OcctKernel } from 'occt-wasm';
import { extractFeatureCandidates } from './candidates.js';
import { recognizeHoles } from './hole-recognizer.js';
import { recognizeCavities } from './cavity-recognizer.js';
import { applyFeatureRules } from './rules.js';
import { calculateExclusionsWithKernel } from './exclusions.js';

function apiNumber(value) {
  return Number(value.toFixed(9));
}

function publicFeature(feature) {
  const { excludedFaceIds: _excludedFaceIds, recognitionReason: _recognitionReason, ...safe } = feature;
  return Object.fromEntries(Object.entries(safe).map(([key, value]) => [
    key,
    typeof value === 'number' ? apiNumber(value) : value,
  ]));
}

function publicSummary(summary) {
  return Object.fromEntries(Object.entries(summary).map(([key, value]) => {
    if (typeof value === 'number') return [key, apiNumber(value)];
    if (value && typeof value === 'object' && 'mm2' in value) {
      return [key, {
        mm2: apiNumber(value.mm2),
        cm2: apiNumber(value.cm2),
        m2: apiNumber(value.m2),
      }];
    }
    return [key, value];
  }));
}

export function emptyFeatureResult(totalAreaMm2 = 0) {
  const zero = {
    mm2: 0,
    cm2: 0,
    m2: 0,
  };
  const total = {
    mm2: totalAreaMm2,
    cm2: totalAreaMm2 / 100,
    m2: totalAreaMm2 / 1_000_000,
  };
  return {
    features: [],
    faceCatalog: [],
    summary: {
      totalAreaMm2,
      confirmedPhysicalContactAreaMm2: 0,
      confirmedContactExcludedAreaMm2: 0,
      confirmedHoleExcludedAreaMm2: 0,
      confirmedCavityExcludedAreaMm2: 0,
      confirmedManualExcludedAreaMm2: 0,
      reviewRequiredFeatureAreaMm2: 0,
      rawContactExcludedAreaMm2: 0,
      rawFeatureExcludedAreaMm2: 0,
      rawExcludedAreaMm2: 0,
      overlapAreaMm2: 0,
      uniqueConfirmedExcludedAreaMm2: 0,
      paintableAreaMm2: totalAreaMm2,
      totalArea: total,
      confirmedPhysicalContactArea: zero,
      confirmedContactExcludedArea: zero,
      confirmedHoleExcludedArea: zero,
      confirmedCavityExcludedArea: zero,
      confirmedManualExcludedArea: zero,
      reviewRequiredFeatureArea: zero,
      rawExcludedArea: zero,
      overlapArea: zero,
      uniqueConfirmedExcludedArea: zero,
      paintableArea: total,
    },
    statistics: {
      candidateExtractionMs: 0,
      holeRecognitionMs: 0,
      cavityRecognitionMs: 0,
      ruleEvaluationMs: 0,
      overlapResolutionMs: 0,
      totalFeatureProcessingMs: 0,
      featureCandidateCount: 0,
      confirmedFeatureCount: 0,
      reviewRequiredCount: 0,
    },
  };
}

export function detectFeatures(kernel, shape, topology, config, contactResult) {
  const totalStarted = performance.now();
  const candidateStarted = performance.now();
  const context = extractFeatureCandidates(kernel, shape, topology, config);
  const candidateExtractionMs = performance.now() - candidateStarted;
  context.createdAt = new Date().toISOString();
  try {
    const holeStarted = performance.now();
    const holes = recognizeHoles(kernel, context, config);
    const holeRecognitionMs = performance.now() - holeStarted;
    const cavityStarted = performance.now();
    const cavities = recognizeCavities(context, holes.flatMap((feature) => feature.faceIds), config);
    const cavityRecognitionMs = performance.now() - cavityStarted;
    const recognized = [...holes, ...cavities].sort((left, right) => left.featureId.localeCompare(right.featureId));
    const ruleStarted = performance.now();
    const features = applyFeatureRules(recognized, config, context.faceCatalog);
    const ruleEvaluationMs = performance.now() - ruleStarted;
    const overlapStarted = performance.now();
    const summary = calculateExclusionsWithKernel(kernel, {
      contacts: contactResult.contacts,
      contactSummary: contactResult.summary,
      features,
      faceCatalog: context.faceCatalog,
      totalAreaMm2: topology.totalArea.mm2,
      areaToleranceMm2: config.areaToleranceMm2,
    });
    const overlapResolutionMs = performance.now() - overlapStarted;
    return {
      features,
      faceCatalog: context.faceCatalog,
      summary,
      statistics: {
        candidateExtractionMs: apiNumber(candidateExtractionMs),
        holeRecognitionMs: apiNumber(holeRecognitionMs),
        cavityRecognitionMs: apiNumber(cavityRecognitionMs),
        ruleEvaluationMs: apiNumber(ruleEvaluationMs),
        overlapResolutionMs: apiNumber(overlapResolutionMs),
        totalFeatureProcessingMs: apiNumber(performance.now() - totalStarted),
        featureCandidateCount: recognized.length,
        confirmedFeatureCount: features.filter((feature) => feature.status === 'confirmed').length,
        reviewRequiredCount: features.filter((feature) => feature.status === 'review_required').length,
      },
    };
  } catch (error) {
    if (!error.code) error.code = 'FEATURE_GEOMETRY_FAILED';
    throw error;
  } finally {
    context.release();
  }
}

export async function recalculateStage4({
  contacts,
  contactSummary,
  features,
  faceCatalog,
  totalAreaMm2,
  areaToleranceMm2,
}) {
  const kernel = await OcctKernel.init();
  try {
    return calculateExclusionsWithKernel(kernel, {
      contacts,
      contactSummary,
      features,
      faceCatalog,
      totalAreaMm2,
      areaToleranceMm2,
    });
  } catch (error) {
    if (!error.code) error.code = 'FEATURE_OVERLAP_FAILED';
    throw error;
  } finally {
    kernel.releaseAll();
    kernel[Symbol.dispose]();
  }
}

export function reclassifyFeatures(features, rules, faceCatalog) {
  return applyFeatureRules(features, rules, faceCatalog);
}

export function createManualFeature(jobId, faceIds, faceCatalog) {
  const selected = [...new Set(faceIds)].sort();
  const faceById = new Map(faceCatalog.map((face) => [face.id, face]));
  const bodies = [...new Set(selected.map((id) => faceById.get(id)?.bodyId))];
  const fingerprint = createHash('sha256').update(`${jobId}:${selected.join(',')}`).digest('hex').slice(0, 24);
  return {
    featureId: `manual_${fingerprint}`,
    bodyId: bodies.length === 1 ? bodies[0] : 'multiple',
    featureType: 'manual_feature',
    faceIds: selected,
    sideFaceIds: selected,
    bottomFaceIds: [],
    transitionFaceIds: [],
    openingEdgeIds: [],
    axis: null,
    diameterMm: null,
    radiusMm: null,
    depthMm: null,
    through: false,
    accessible: null,
    closed: null,
    confidence: 1,
    recognitionReason: 'Ручной выбор граней',
    segments: [],
    diametersMm: [],
    depthsMm: [],
    createdAt: new Date().toISOString(),
    manualDecision: 'manually_confirmed',
  };
}

export function publicFeaturesResult(featureResult) {
  return {
    features: featureResult.features.map(publicFeature),
    summary: publicSummary(featureResult.summary),
    statistics: featureResult.statistics,
  };
}

export async function refreshStage4JobState(job, {
  contacts = job.contacts,
  contactSummary = job.contactSummary,
  features = job.features,
  rules = job.featureRules,
  statistics = job.featureStatistics,
  areaToleranceMm2 = rules.areaToleranceMm2,
} = {}) {
  const summary = await recalculateStage4({
    contacts,
    contactSummary,
    features,
    faceCatalog: job.faceCatalog,
    totalAreaMm2: job.diagnostics.totalArea.mm2,
    areaToleranceMm2,
  });
  return {
    features,
    featureRules: rules,
    featureSummary: summary,
    featureStatistics: {
      ...statistics,
      confirmedFeatureCount: features.filter((feature) => feature.status === 'confirmed').length,
      reviewRequiredCount: features.filter((feature) => feature.status === 'review_required').length,
    },
  };
}

export const featureServiceInternals = { publicFeature, publicSummary };
