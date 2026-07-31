import { createHash } from 'node:crypto';
import { connectedComponents } from './grouping.js';

function deterministicId(bodyId, type, faceIds) {
  return `feature_${createHash('sha256')
    .update(`${bodyId}:${type}:${[...faceIds].sort().join(',')}`)
    .digest('hex')
    .slice(0, 24)}`;
}

function liesOnOuterBoundary(face, bounds, tolerance) {
  const axes = [
    ['xmin', 'xmax'],
    ['ymin', 'ymax'],
    ['zmin', 'zmax'],
  ];
  return axes.some(([min, max]) => (
    Math.abs(face.bounds[min] - face.bounds[max]) <= tolerance
    && (Math.abs(face.bounds[min] - bounds[min]) <= tolerance
      || Math.abs(face.bounds[max] - bounds[max]) <= tolerance)
  ));
}

function makeCavity(context, body, type, faceIds, confidence, reason, closed) {
  const sorted = [...new Set(faceIds)].sort();
  return {
    featureId: deterministicId(body.id, type, sorted),
    bodyId: body.id,
    featureType: type,
    faceIds: sorted,
    sideFaceIds: sorted,
    bottomFaceIds: [],
    transitionFaceIds: [],
    openingEdgeIds: context.edges
      .filter((edge) => edge.faceIds.some((id) => sorted.includes(id))
        && edge.faceIds.some((id) => !sorted.includes(id)))
      .map((edge) => edge.id)
      .sort(),
    axis: null,
    diameterMm: null,
    radiusMm: null,
    depthMm: null,
    through: false,
    accessible: !closed,
    closed,
    confidence,
    recognitionReason: reason,
    segments: [],
    diametersMm: [],
    depthsMm: [],
    createdAt: context.createdAt,
  };
}

export function recognizeCavities(context, occupiedFaceIds, config) {
  const occupied = new Set(occupiedFaceIds);
  const features = [];
  for (const body of context.bodies) {
    for (const shell of body.shells.filter((candidate) => candidate.closedInternal)) {
      const faceIds = shell.faceIds.filter((id) => !occupied.has(id));
      if (faceIds.length > 0) {
        features.push(makeCavity(
          context,
          body,
          'closed_internal_cavity',
          faceIds,
          0.99,
          'Грани образуют замкнутую внутреннюю оболочку, не связанную с внешней границей тела',
          true,
        ));
        faceIds.forEach((id) => occupied.add(id));
      }
    }

    const candidates = body.faces.filter((face) => !occupied.has(face.id)
      && !liesOnOuterBoundary(face, body.bounds, config.axisToleranceMm));
    const groups = connectedComponents(candidates, (left, right) => left.edgeIds
      .some((edgeId) => right.edgeIds.includes(edgeId)));
    for (const group of groups.filter((candidate) => candidate.length >= 3)) {
      const faceIds = group.map((face) => face.id);
      const openingEdges = context.edges.filter((edge) => edge.faceIds.some((id) => faceIds.includes(id))
        && edge.faceIds.some((id) => !faceIds.includes(id)));
      if (openingEdges.length === 0) continue;
      features.push(makeCavity(
        context,
        body,
        'open_internal_cavity',
        faceIds,
        0.78,
        'Внутренние вогнутые грани связаны с внешней областью через открытый контур',
        false,
      ));
    }
  }
  return features.sort((left, right) => left.featureId.localeCompare(right.featureId));
}

export const cavityRecognizerInternals = { liesOnOuterBoundary };
