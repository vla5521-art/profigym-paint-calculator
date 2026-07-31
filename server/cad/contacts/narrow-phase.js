import { createHash } from 'node:crypto';
import {
  classifyExactContact,
  classifyZeroAreaContact,
  normalAlignmentDifferenceDeg,
} from './classifier.js';

function rounded(value) {
  return Number(value.toFixed(9));
}

function vectorSubtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function vectorScale(vector, scalar) {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function vectorDot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function midpointNormal(kernel, face) {
  const bounds = kernel.uvBounds(face.handle);
  const u = (bounds.uMin + bounds.uMax) / 2;
  const v = (bounds.vMin + bounds.vMax) / 2;
  return kernel.surfaceNormal(face.handle, u, v);
}

function patchFingerprint(kernel, patch, bodyPairKey) {
  const area = rounded(kernel.getSurfaceArea(patch));
  const bounds = kernel.getBoundingBox(patch);
  const serializedBounds = Object.values(bounds).map(rounded).join(':');
  return createHash('sha256')
    .update(`${bodyPairKey}:${area}:${serializedBounds}`)
    .digest('hex')
    .slice(0, 24);
}

function contactId(faceAId, faceBId, contactType, patchKey) {
  const [first, second] = [faceAId, faceBId].sort();
  return `contact_${createHash('sha256')
    .update(`${first}:${second}:${contactType}:${patchKey}`)
    .digest('hex')
    .slice(0, 24)}`;
}

function publicFace(face) {
  return {
    id: face.id,
    bodyId: face.bodyId,
    surfaceType: face.surfaceType,
    areaMm2: face.areaMm2,
    center: face.center,
  };
}

function potentialPlanarOverlap(kernel, faceA, faceB, config) {
  if (faceA.surfaceType !== 'plane' || faceB.surfaceType !== 'plane') return null;
  const normalA = midpointNormal(kernel, faceA);
  const normalB = midpointNormal(kernel, faceB);
  const angleDifferenceDeg = normalAlignmentDifferenceDeg(normalA, normalB);
  if (angleDifferenceDeg === null || angleDifferenceDeg > config.angleToleranceDeg) return null;

  const centerDelta = vectorSubtract(faceB.center, faceA.center);
  const signedDistance = vectorDot(centerDelta, normalA);
  const translation = vectorScale(normalA, -signedDistance);
  const projected = kernel.translate(faceB.handle, translation.x, translation.y, translation.z);
  try {
    const patch = kernel.common(faceA.handle, projected);
    const areaMm2 = kernel.getSurfaceArea(patch);
    if (areaMm2 <= config.areaToleranceMm2) {
      kernel.release(patch);
      return null;
    }
    return { patch, areaMm2, angleDifferenceDeg };
  } finally {
    kernel.release(projected);
  }
}

export function exactCheck(kernel, candidate, config, createdAt) {
  const { faceA, faceB } = candidate;
  const distanceMm = kernel.distanceBetween(faceA.handle, faceB.handle);
  if (distanceMm > config.distanceToleranceMm) return null;

  const bodyPairKey = [faceA.bodyId, faceB.bodyId].sort().join('|');
  let patch = null;
  let areaMm2 = 0;
  let angleDifferenceDeg = null;
  let potential = false;

  if (distanceMm <= 1e-7) {
    patch = kernel.common(faceA.handle, faceB.handle);
    areaMm2 = kernel.getSurfaceArea(patch);
    const normalA = midpointNormal(kernel, faceA);
    const normalB = midpointNormal(kernel, faceB);
    angleDifferenceDeg = normalAlignmentDifferenceDeg(normalA, normalB);
  } else {
    const projected = potentialPlanarOverlap(kernel, faceA, faceB, config);
    if (projected) {
      patch = projected.patch;
      areaMm2 = projected.areaMm2;
      angleDifferenceDeg = projected.angleDifferenceDeg;
      potential = true;
    }
  }

  let classification;
  if (!potential && areaMm2 > config.areaToleranceMm2) {
    classification = classifyExactContact({
      faceA: publicFace(faceA),
      faceB: publicFace(faceB),
      contactAreaMm2: areaMm2,
      angleDifferenceDeg,
      config,
    });
  } else {
    classification = classifyZeroAreaContact({
      distanceMm,
      hasPotentialArea: potential && areaMm2 > config.areaToleranceMm2,
      config,
    });
  }

  if (!patch) {
    patch = kernel.makeNullShape();
  }
  const patchKey = areaMm2 > config.areaToleranceMm2
    ? patchFingerprint(kernel, patch, bodyPairKey)
    : createHash('sha256').update(`${bodyPairKey}:${distanceMm}:${classification.contactType}`).digest('hex').slice(0, 24);
  const initialStatus = classification.status;
  const contactAreaMm2 = areaMm2 > config.areaToleranceMm2 ? areaMm2 : 0;

  try {
    return {
      contactId: contactId(faceA.id, faceB.id, classification.contactType, patchKey),
      bodyAId: faceA.bodyId,
      bodyBId: faceB.bodyId,
      faceAId: faceA.id,
      faceBId: faceB.id,
      contactType: classification.contactType,
      contactAreaMm2,
      physicalContactAreaMm2: classification.contactType === 'near_gap' ? 0 : contactAreaMm2,
      potentialContactAreaMm2: classification.contactType === 'near_gap' ? contactAreaMm2 : 0,
      distanceMm,
      angleDifferenceDeg,
      toleranceMm: config.distanceToleranceMm,
      confidence: classification.confidence,
      status: initialStatus,
      initialStatus,
      manualDecision: null,
      reason: classification.reason,
      createdAt,
      patchKey,
      patchBrep: contactAreaMm2 > 0 ? kernel.toBREP(patch) : null,
    };
  } finally {
    kernel.release(patch);
  }
}

export function deduplicateNarrowResults(results) {
  const ordered = results
    .filter(Boolean)
    .sort((left, right) => left.contactId.localeCompare(right.contactId));
  const unique = [];
  const seenIds = new Set();
  const positiveBodyPairs = new Set(
    ordered
      .filter((contact) => contact.contactAreaMm2 > 0 && contact.contactType !== 'near_gap')
      .map((contact) => [contact.bodyAId, contact.bodyBId].sort().join('|')),
  );
  const tangentBodyPairs = new Set();

  for (const contact of ordered) {
    if (seenIds.has(contact.contactId)) continue;
    if (contact.contactType === 'near_gap' && contact.status === 'rejected') continue;
    const bodyPair = [contact.bodyAId, contact.bodyBId].sort().join('|');
    if (contact.contactType === 'tangent_contact') {
      if (positiveBodyPairs.has(bodyPair) || tangentBodyPairs.has(bodyPair)) continue;
      tangentBodyPairs.add(bodyPair);
    }
    seenIds.add(contact.contactId);
    unique.push(contact);
  }
  return unique;
}
