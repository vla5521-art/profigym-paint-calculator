import { createHash } from 'node:crypto';
import {
  add,
  angleDifferenceDeg,
  connectedComponents,
  lineDistance,
  magnitude,
  normalize,
  rangesTouch,
  scale,
  subtract,
} from './grouping.js';

function rounded(value) {
  return Number(value.toFixed(9));
}

function pointAverage(points) {
  return scale(points.reduce(add, { x: 0, y: 0, z: 0 }), 1 / points.length);
}

function faceAxisRange(axis, face) {
  const projections = [
    { x: face.bounds.xmin, y: face.bounds.ymin, z: face.bounds.zmin },
    { x: face.bounds.xmin, y: face.bounds.ymin, z: face.bounds.zmax },
    { x: face.bounds.xmin, y: face.bounds.ymax, z: face.bounds.zmin },
    { x: face.bounds.xmin, y: face.bounds.ymax, z: face.bounds.zmax },
    { x: face.bounds.xmax, y: face.bounds.ymin, z: face.bounds.zmin },
    { x: face.bounds.xmax, y: face.bounds.ymin, z: face.bounds.zmax },
    { x: face.bounds.xmax, y: face.bounds.ymax, z: face.bounds.zmin },
    { x: face.bounds.xmax, y: face.bounds.ymax, z: face.bounds.zmax },
  ].map((point) => point.x * axis.x + point.y * axis.y + point.z * axis.z);
  return { min: Math.min(...projections), max: Math.max(...projections) };
}

function cylinderGeometry(kernel, face) {
  const data = kernel.getFaceCylinderData(face.handle);
  if (!data) return null;
  const u = (face.uv.uMin + face.uv.uMax) / 2;
  const vMid = (face.uv.vMin + face.uv.vMax) / 2;
  const low = kernel.pointOnSurface(face.handle, u, face.uv.vMin);
  const high = kernel.pointOnSurface(face.handle, u, face.uv.vMax);
  const direction = normalize(subtract(high, low));
  if (!direction) return null;
  const point = kernel.pointOnSurface(face.handle, u, vMid);
  const normal = kernel.surfaceNormal(face.handle, u, vMid);
  const radialSign = face.orientation === 'reversed' ? 1 : -1;
  const origin = add(point, scale(normal, radialSign * data.radius));
  return {
    origin,
    direction,
    radiusMm: data.radius,
    depthMm: Math.abs(face.uv.vMax - face.uv.vMin),
    uSpan: Math.abs(face.uv.uMax - face.uv.uMin),
    range: faceAxisRange(direction, face),
  };
}

function coneGeometry(kernel, face) {
  const samples = (v) => Array.from({ length: 12 }, (_, index) => {
    const u = face.uv.uMin + (face.uv.uMax - face.uv.uMin) * index / 12;
    return kernel.pointOnSurface(face.handle, u, v);
  });
  const lowPoints = samples(face.uv.vMin);
  const highPoints = samples(face.uv.vMax);
  const lowCenter = pointAverage(lowPoints);
  const highCenter = pointAverage(highPoints);
  const direction = normalize(subtract(highCenter, lowCenter));
  if (!direction) return null;
  const lowRadius = magnitude(subtract(lowPoints[0], lowCenter));
  const highRadius = magnitude(subtract(highPoints[0], highCenter));
  return {
    origin: lowCenter,
    direction,
    radiusMm: Math.max(lowRadius, highRadius),
    radiiMm: [lowRadius, highRadius],
    depthMm: magnitude(subtract(highCenter, lowCenter)),
    uSpan: Math.abs(face.uv.uMax - face.uv.uMin),
    range: faceAxisRange(direction, face),
  };
}

function axesMatch(left, right, config) {
  return angleDifferenceDeg(left.direction, right.direction) <= config.angleToleranceDeg
    && lineDistance(left, right) <= config.axisToleranceMm;
}

function deterministicFeatureId(bodyId, featureType, faceIds, fingerprint) {
  return `feature_${createHash('sha256')
    .update(`${bodyId}:${featureType}:${[...faceIds].sort().join(',')}:${fingerprint}`)
    .digest('hex')
    .slice(0, 24)}`;
}

function sharedEdgeIds(context, faceIds) {
  const selected = new Set(faceIds);
  return context.edges
    .filter((edge) => edge.faceIds.filter((id) => selected.has(id)).length > 1)
    .map((edge) => edge.id)
    .sort();
}

function circleBoundaryEdges(context, faceIds) {
  const selected = new Set(faceIds);
  return context.edges
    .filter((edge) => edge.curveType === 'circle'
      && edge.faceIds.some((id) => selected.has(id))
      && edge.faceIds.some((id) => !selected.has(id)))
    .map((edge) => edge.id)
    .sort();
}

function adjacentFaceIds(context, body, selectedIds) {
  const selected = new Set(selectedIds);
  const adjacent = new Set();
  for (const faceId of selected) {
    const face = context.faceById.get(faceId);
    const handles = context.kernel.adjacentFaces(body.handle, face.handle);
    for (const handle of handles) {
      const hash = context.kernel.hashCode(handle, context.hashUpperBound);
      const match = context.faceByHash.get(hash);
      if (match && !selected.has(match.id)) adjacent.add(match.id);
      context.kernel.release(handle);
    }
  }
  return [...adjacent].sort();
}

function featureFromGroup(context, body, cylinders, cones, config) {
  const cylinderFaceIds = cylinders.map((candidate) => candidate.face.id).sort();
  const coneFaceIds = cones.map((candidate) => candidate.face.id).sort();
  const sideFaceIds = [...cylinderFaceIds, ...coneFaceIds].sort();
  const adjacentIds = adjacentFaceIds(context, body, sideFaceIds);
  const distinctRadii = [...new Set(cylinders.map((candidate) => rounded(candidate.geometry.radiusMm)))].sort((a, b) => a - b);
  const minRadius = Math.min(...distinctRadii);
  const bottomFaceIds = [];
  const transitionFaceIds = [...coneFaceIds];

  for (const faceId of adjacentIds) {
    const face = context.faceById.get(faceId);
    if (face.surfaceType !== 'plane') continue;
    const adjacentSideCount = new Set(face.edgeIds
      .flatMap((edgeId) => context.edgeById.get(edgeId)?.faceIds ?? [])
      .filter((id) => sideFaceIds.includes(id))).size;
    const circleArea = Math.PI * minRadius ** 2;
    if (face.areaMm2 <= circleArea * 1.08 + config.areaToleranceMm2) bottomFaceIds.push(faceId);
    else if (adjacentSideCount > 1 || distinctRadii.length > 1) transitionFaceIds.push(faceId);
  }

  const ranges = [...cylinders, ...cones].map((candidate) => candidate.geometry.range);
  const depthMm = Math.max(...ranges.map((range) => range.max)) - Math.min(...ranges.map((range) => range.min));
  const through = bottomFaceIds.length === 0;
  let featureType = through ? 'through_hole' : 'blind_hole';
  if (cones.length > 0) featureType = 'countersunk_hole';
  else if (distinctRadii.length >= 3) featureType = 'stepped_hole';
  else if (distinctRadii.length === 2) featureType = 'counterbored_hole';

  const allFaceIds = [...new Set([...sideFaceIds, ...bottomFaceIds, ...transitionFaceIds])].sort();
  const primary = cylinders[0].geometry;
  const maximumRadius = Math.max(
    ...distinctRadii,
    ...cones.map((candidate) => candidate.geometry.radiusMm),
  );
  const diameterMm = maximumRadius * 2;
  const fingerprint = [
    rounded(diameterMm),
    rounded(depthMm),
    rounded(primary.origin.x),
    rounded(primary.origin.y),
    rounded(primary.origin.z),
    rounded(primary.direction.x),
    rounded(primary.direction.y),
    rounded(primary.direction.z),
  ].join(':');
  const segments = cylinders
    .map((candidate) => ({
      faceIds: [candidate.face.id],
      diameterMm: rounded(candidate.geometry.radiusMm * 2),
      depthMm: rounded(candidate.geometry.depthMm),
    }))
    .sort((left, right) => left.diameterMm - right.diameterMm || left.faceIds[0].localeCompare(right.faceIds[0]));

  return {
    featureId: deterministicFeatureId(body.id, featureType, allFaceIds, fingerprint),
    bodyId: body.id,
    featureType,
    faceIds: allFaceIds,
    sideFaceIds,
    bottomFaceIds: [...new Set(bottomFaceIds)].sort(),
    transitionFaceIds: [...new Set(transitionFaceIds)].sort(),
    openingEdgeIds: circleBoundaryEdges(context, sideFaceIds),
    sharedEdgeIds: sharedEdgeIds(context, sideFaceIds),
    axis: {
      originMm: [rounded(primary.origin.x), rounded(primary.origin.y), rounded(primary.origin.z)],
      direction: [rounded(primary.direction.x), rounded(primary.direction.y), rounded(primary.direction.z)],
    },
    diameterMm: rounded(diameterMm),
    radiusMm: rounded(diameterMm / 2),
    depthMm: rounded(depthMm),
    through,
    accessible: true,
    closed: false,
    confidence: cones.length > 0 ? 0.94 : distinctRadii.length > 1 ? 0.95 : through ? 0.98 : 0.97,
    recognitionReason: through
      ? 'Внутренняя цилиндрическая поверхность связана с двумя открытыми контурами'
      : 'Внутренняя цилиндрическая поверхность связана с открытым входом и внутренним дном',
    segments,
    diametersMm: distinctRadii.map((radius) => rounded(radius * 2)),
    depthsMm: segments.map((segment) => segment.depthMm),
    createdAt: context.createdAt,
  };
}

function markIntersections(features, config) {
  const next = features.map((feature) => ({ ...feature }));
  for (let leftIndex = 0; leftIndex < next.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < next.length; rightIndex += 1) {
      const left = next[leftIndex];
      const right = next[rightIndex];
      if (left.bodyId !== right.bodyId || !left.axis || !right.axis) continue;
      const leftLine = {
        origin: { x: left.axis.originMm[0], y: left.axis.originMm[1], z: left.axis.originMm[2] },
        direction: { x: left.axis.direction[0], y: left.axis.direction[1], z: left.axis.direction[2] },
      };
      const rightLine = {
        origin: { x: right.axis.originMm[0], y: right.axis.originMm[1], z: right.axis.originMm[2] },
        direction: { x: right.axis.direction[0], y: right.axis.direction[1], z: right.axis.direction[2] },
      };
      const angle = angleDifferenceDeg(leftLine.direction, rightLine.direction);
      if (angle <= config.angleToleranceDeg) continue;
      if (lineDistance(leftLine, rightLine) > left.radiusMm + right.radiusMm + config.axisToleranceMm) continue;
      const ids = [left.featureId, right.featureId].sort();
      next[leftIndex] = {
        ...left,
        featureType: 'intersecting_holes',
        confidence: Math.min(left.confidence, 0.82),
        intersectingFeatureIds: ids.filter((id) => id !== left.featureId),
        recognitionReason: 'Ось отверстия пересекает другое распознанное отверстие; требуется проверка общей топологии',
      };
      next[rightIndex] = {
        ...right,
        featureType: 'intersecting_holes',
        confidence: Math.min(right.confidence, 0.82),
        intersectingFeatureIds: ids.filter((id) => id !== right.featureId),
        recognitionReason: 'Ось отверстия пересекает другое распознанное отверстие; требуется проверка общей топологии',
      };
    }
  }
  const reidentified = next.map((feature) => {
    const fingerprint = `${feature.diameterMm}:${feature.depthMm}:${feature.axis?.originMm.join(':')}`;
    return {
      ...feature,
      featureId: deterministicFeatureId(feature.bodyId, feature.featureType, feature.faceIds, fingerprint),
    };
  });
  const idMap = new Map(next.map((feature, index) => [feature.featureId, reidentified[index].featureId]));
  return reidentified.map((feature) => ({
    ...feature,
    intersectingFeatureIds: feature.intersectingFeatureIds?.map((id) => idMap.get(id) ?? id),
  }));
}

function slotFeature(context, body, candidates) {
  const geometry = candidates[0].geometry;
  const faceIds = candidates.map((candidate) => candidate.face.id).sort();
  const fingerprint = `${rounded(geometry.radiusMm)}:${faceIds.join(':')}`;
  return {
    featureId: deterministicFeatureId(body.id, 'slot', faceIds, fingerprint),
    bodyId: body.id,
    featureType: 'slot',
    faceIds,
    sideFaceIds: faceIds,
    bottomFaceIds: [],
    transitionFaceIds: [],
    openingEdgeIds: circleBoundaryEdges(context, faceIds),
    axis: {
      originMm: [geometry.origin.x, geometry.origin.y, geometry.origin.z].map(rounded),
      direction: [geometry.direction.x, geometry.direction.y, geometry.direction.z].map(rounded),
    },
    diameterMm: rounded(geometry.radiusMm * 2),
    radiusMm: rounded(geometry.radiusMm),
    depthMm: rounded(Math.max(...candidates.map((candidate) => candidate.geometry.depthMm))),
    through: false,
    accessible: true,
    closed: false,
    confidence: 0.72,
    recognitionReason: 'Цилиндрическая поверхность имеет открытый неполный контур и не подтверждает отверстие',
    segments: [],
    diametersMm: [rounded(geometry.radiusMm * 2)],
    depthsMm: candidates.map((candidate) => rounded(candidate.geometry.depthMm)),
    createdAt: context.createdAt,
  };
}

export function recognizeHoles(kernel, context, config) {
  context.kernel = kernel;
  context.hashUpperBound = 2_147_483_647;
  context.faceByHash = new Map(context.faces.map((face) => [kernel.hashCode(face.handle, context.hashUpperBound), face]));
  const features = [];
  for (const body of context.bodies) {
    const cylinders = body.faces
      .filter((face) => face.surfaceType === 'cylinder' && face.orientation === 'reversed')
      .map((face) => ({ face, geometry: cylinderGeometry(kernel, face) }))
      .filter((candidate) => candidate.geometry);
    const full = cylinders.filter((candidate) => candidate.geometry.uSpan >= Math.PI * 1.75);
    const partial = cylinders.filter((candidate) => candidate.geometry.uSpan < Math.PI * 1.75);

    const slotGroups = connectedComponents(partial, (left, right) => axesMatch(left.geometry, right.geometry, config)
      && rangesTouch(left.geometry.range, right.geometry.range, config.axisToleranceMm * 4));
    for (const group of slotGroups) features.push(slotFeature(context, body, group));

    const groups = connectedComponents(full, (left, right) => axesMatch(left.geometry, right.geometry, config)
      && rangesTouch(left.geometry.range, right.geometry.range, config.axisToleranceMm * 4));
    const cones = body.faces
      .filter((face) => face.surfaceType === 'cone' && face.orientation === 'reversed')
      .map((face) => ({ face, geometry: coneGeometry(kernel, face) }))
      .filter((candidate) => candidate.geometry && candidate.geometry.uSpan >= Math.PI * 1.75);

    for (const group of groups) {
      const groupCones = cones.filter((cone) => group.some((cylinder) => axesMatch(cone.geometry, cylinder.geometry, config))
        && group.some((cylinder) => rangesTouch(cone.geometry.range, cylinder.geometry.range, config.axisToleranceMm * 4)));
      features.push(featureFromGroup(context, body, group, groupCones, config));
    }
  }
  return markIntersections(features, config).sort((left, right) => left.featureId.localeCompare(right.featureId));
}

export const holeRecognizerInternals = {
  cylinderGeometry,
  coneGeometry,
  axesMatch,
  deterministicFeatureId,
};
