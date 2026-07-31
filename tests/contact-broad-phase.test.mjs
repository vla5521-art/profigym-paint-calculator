import test from 'node:test';
import assert from 'node:assert/strict';
import { findBodyCandidates, findFaceCandidates } from '../server/cad/contacts/broad-phase.js';

function entity(id, xmin, xmax, bodyId = id) {
  return {
    id,
    bodyId,
    bounds: { xmin, xmax, ymin: 0, ymax: 1, zmin: 0, zmax: 1 },
    faces: [],
  };
}

test('broad phase excludes distant bodies and reports pair reduction', () => {
  const bodies = [entity('a', 0, 1), entity('b', 10, 11), entity('c', 20, 21)];
  const result = findBodyCandidates(bodies, 0.05);
  assert.equal(result.statistics.bodyCount, 3);
  assert.equal(result.statistics.potentialBodyPairCount, 3);
  assert.equal(result.statistics.broadPhaseBodyPairCount, 0);
  assert.deepEqual(result.pairs, []);
});

test('broad phase never duplicates body or face pairs and is order independent', () => {
  const faceA = entity('face-a', 0, 1, 'body-a');
  const faceB = entity('face-b', 1, 2, 'body-b');
  const bodyA = { ...entity('body-a', 0, 1), faces: [faceA] };
  const bodyB = { ...entity('body-b', 1, 2), faces: [faceB] };
  const forward = findBodyCandidates([bodyA, bodyB], 0.05);
  const reverse = findBodyCandidates([bodyB, bodyA], 0.05);
  assert.deepEqual(forward.pairs.map((pair) => pair.key), reverse.pairs.map((pair) => pair.key));
  assert.equal(new Set(forward.pairs.map((pair) => pair.key)).size, forward.pairs.length);
  const faces = findFaceCandidates([...forward.pairs, ...reverse.pairs], 0.05);
  assert.equal(faces.length, 1);
  assert.equal(faces[0].key, 'face-a|face-b');
});
