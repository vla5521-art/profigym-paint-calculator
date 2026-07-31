import { areaUnits } from '../units.js';

const CONFIRMED_FEATURE_STATUSES = new Set(['confirmed', 'manually_confirmed']);

function uniqueByValue(values) {
  return [...new Set(values)];
}

function releaseMany(kernel, handles) {
  for (const handle of handles) kernel.release(handle);
}

function unionBrepsArea(kernel, breps) {
  const unique = uniqueByValue(breps);
  const handles = unique.map((brep) => kernel.fromBREP(brep));
  try {
    if (handles.length === 0) return 0;
    if (handles.length === 1) return kernel.getSurfaceArea(handles[0]);
    const fused = kernel.fuseAll(handles);
    try {
      return kernel.getSurfaceArea(fused);
    } finally {
      kernel.release(fused);
    }
  } finally {
    releaseMany(kernel, handles);
  }
}

function publicAreaSummary(summary) {
  return {
    ...summary,
    totalArea: areaUnits(summary.totalAreaMm2),
    confirmedPhysicalContactArea: areaUnits(summary.confirmedPhysicalContactAreaMm2),
    confirmedContactExcludedArea: areaUnits(summary.confirmedContactExcludedAreaMm2),
    confirmedHoleExcludedArea: areaUnits(summary.confirmedHoleExcludedAreaMm2),
    confirmedCavityExcludedArea: areaUnits(summary.confirmedCavityExcludedAreaMm2),
    confirmedManualExcludedArea: areaUnits(summary.confirmedManualExcludedAreaMm2),
    reviewRequiredFeatureArea: areaUnits(summary.reviewRequiredFeatureAreaMm2),
    rawExcludedArea: areaUnits(summary.rawExcludedAreaMm2),
    overlapArea: areaUnits(summary.overlapAreaMm2),
    uniqueConfirmedExcludedArea: areaUnits(summary.uniqueConfirmedExcludedAreaMm2),
    paintableArea: areaUnits(summary.paintableAreaMm2),
  };
}

export function calculateExclusionsWithKernel(kernel, {
  contacts,
  contactSummary,
  features,
  faceCatalog,
  totalAreaMm2,
  areaToleranceMm2,
}) {
  const faceById = new Map(faceCatalog.map((face) => [face.id, face]));
  const fullFaceExclusions = new Set();
  const contactBrepsByFace = new Map();
  const confirmedFeatures = features.filter((feature) => CONFIRMED_FEATURE_STATUSES.has(feature.status));

  for (const feature of confirmedFeatures) {
    for (const faceId of feature.excludedFaceIds) fullFaceExclusions.add(faceId);
  }
  for (const contact of contacts.filter((candidate) => candidate.status === 'confirmed' && candidate.patchBrep)) {
    for (const faceId of [contact.faceAId, contact.faceBId]) {
      if (!contactBrepsByFace.has(faceId)) contactBrepsByFace.set(faceId, []);
      contactBrepsByFace.get(faceId).push(contact.patchBrep);
    }
  }

  let uniqueConfirmedExcludedAreaMm2 = 0;
  const allFaceIds = new Set([...fullFaceExclusions, ...contactBrepsByFace.keys()]);
  for (const faceId of allFaceIds) {
    if (fullFaceExclusions.has(faceId)) {
      uniqueConfirmedExcludedAreaMm2 += faceById.get(faceId)?.areaMm2 ?? 0;
    } else {
      uniqueConfirmedExcludedAreaMm2 += unionBrepsArea(kernel, contactBrepsByFace.get(faceId) ?? []);
    }
  }

  const rawContactExcludedAreaMm2 = contactSummary.confirmedExcludedPaintAreaMm2;
  const rawFeatureExcludedAreaMm2 = confirmedFeatures.reduce((sum, feature) => sum + feature.excludedAreaMm2, 0);
  const rawExcludedAreaMm2 = rawContactExcludedAreaMm2 + rawFeatureExcludedAreaMm2;
  const overlapAreaMm2 = Math.max(0, rawExcludedAreaMm2 - uniqueConfirmedExcludedAreaMm2);

  if (uniqueConfirmedExcludedAreaMm2 > totalAreaMm2 + areaToleranceMm2) {
    const error = new Error('Объединённая площадь исключений превышает полную площадь модели');
    error.code = 'FEATURE_AREA_OVERFLOW';
    error.details = { totalAreaMm2, uniqueConfirmedExcludedAreaMm2, areaToleranceMm2 };
    throw error;
  }

  const isHole = (feature) => feature.featureType.includes('hole');
  const isCavity = (feature) => feature.featureType.includes('cavity');
  const sumConfirmed = (predicate) => confirmedFeatures
    .filter(predicate)
    .reduce((sum, feature) => sum + feature.excludedAreaMm2, 0);
  const summary = {
    totalAreaMm2,
    confirmedPhysicalContactAreaMm2: contactSummary.confirmedPhysicalContactAreaMm2,
    confirmedContactExcludedAreaMm2: rawContactExcludedAreaMm2,
    confirmedHoleExcludedAreaMm2: sumConfirmed(isHole),
    confirmedCavityExcludedAreaMm2: sumConfirmed(isCavity),
    confirmedManualExcludedAreaMm2: sumConfirmed((feature) => feature.featureType === 'manual_feature'),
    reviewRequiredFeatureAreaMm2: features
      .filter((feature) => feature.status === 'review_required')
      .reduce((sum, feature) => sum + feature.potentialAreaMm2, 0),
    rawContactExcludedAreaMm2,
    rawFeatureExcludedAreaMm2,
    rawExcludedAreaMm2,
    overlapAreaMm2,
    uniqueConfirmedExcludedAreaMm2,
    paintableAreaMm2: Math.max(0, totalAreaMm2 - uniqueConfirmedExcludedAreaMm2),
  };
  return publicAreaSummary(summary);
}

export const exclusionInternals = { unionBrepsArea, publicAreaSummary };
