import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyExactContact,
  classifyZeroAreaContact,
  normalAlignmentDifferenceDeg,
} from '../server/cad/contacts/classifier.js';

const config = {
  distanceToleranceMm: 0.05,
  angleToleranceDeg: 1,
  areaToleranceMm2: 0.01,
  reviewThreshold: 0.9,
};

test('classifier distinguishes full and partial planar contacts', () => {
  const faceA = { surfaceType: 'plane', areaMm2: 100 };
  const faceB = { surfaceType: 'plane', areaMm2: 100 };
  assert.equal(classifyExactContact({ faceA, faceB, contactAreaMm2: 100, angleDifferenceDeg: 0, config }).contactType, 'full_planar_contact');
  assert.equal(classifyExactContact({ faceA, faceB, contactAreaMm2: 50, angleDifferenceDeg: 0, config }).contactType, 'partial_planar_contact');
});

test('classifier sends low-confidence exact geometry to review', () => {
  const strict = { ...config, reviewThreshold: 0.995 };
  const result = classifyExactContact({
    faceA: { surfaceType: 'plane', areaMm2: 100 },
    faceB: { surfaceType: 'plane', areaMm2: 100 },
    contactAreaMm2: 100,
    angleDifferenceDeg: 0,
    config: strict,
  });
  assert.equal(result.status, 'review_required');
});

test('small positive gap is not auto-confirmed and zero-area contact is rejected', () => {
  assert.equal(classifyZeroAreaContact({ distanceMm: 0.02, hasPotentialArea: true, config }).status, 'review_required');
  const tangent = classifyZeroAreaContact({ distanceMm: 0, hasPotentialArea: false, config });
  assert.equal(tangent.contactType, 'tangent_contact');
  assert.equal(tangent.status, 'rejected');
});

test('normal comparison treats opposite contact normals as aligned', () => {
  assert.equal(normalAlignmentDifferenceDeg({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }), 0);
});
