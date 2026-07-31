import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { analyzeStepContent, closeCadKernel } from '../server/cad/kernel.js';

const fixtureDir = path.resolve('test-models/features');
const manifest = JSON.parse(await fs.readFile(path.join(fixtureDir, 'expected.json'), 'utf8'));
const tolerance = 0.05;

async function analyze(name, options = {}) {
  return analyzeStepContent(await fs.readFile(path.join(fixtureDir, name), 'utf8'), name, options);
}

after(async () => closeCadKernel());

for (const expected of manifest) {
  test(`real STEP feature fixture: ${expected.name}`, async () => {
    const result = await analyze(expected.name);
    assert.equal(result.ok, true);
    assert.ok(Math.abs(result.featureResult.summary.totalAreaMm2 - expected.totalAreaMm2) <= tolerance);
    assert.equal(result.featureResult.features.length, expected.expectedFeatureCount);
    assert.deepEqual(
      result.featureResult.features.map((feature) => feature.featureType).sort(),
      [...expected.expectedTypes].sort(),
    );
    assert.ok(Math.abs(result.featureResult.summary.rawFeatureExcludedAreaMm2 - expected.expectedRawFeatureAreaMm2) <= tolerance);
    assert.ok(Math.abs(result.featureResult.summary.uniqueConfirmedExcludedAreaMm2 - expected.expectedUniqueExcludedAreaMm2) <= tolerance);
    assert.ok(Math.abs(result.featureResult.summary.paintableAreaMm2 - expected.expectedPaintableAreaMm2) <= tolerance);
  });
}

test('inner cylindrical surface is recognized while an outer cylinder is not', async () => {
  const hole = await analyze('through_hole.step');
  const outer = await analyzeStepContent(
    await fs.readFile('test-models/cylinder_r10_h20mm.step', 'utf8'),
    'cylinder_r10_h20mm.step',
  );
  assert.equal(hole.featureResult.features[0].featureType, 'through_hole');
  assert.equal(hole.featureResult.features[0].sideFaceIds.length, 1);
  assert.equal(outer.featureResult.features.length, 0);
});

test('blind-hole bottom is grouped with its cylindrical side but excluded only when configured', async () => {
  const baseline = await analyze('blind_hole.step');
  const withBottom = await analyze('blind_hole.step', { featureConfig: { excludeBottomFace: true } });
  const feature = baseline.featureResult.features[0];
  assert.equal(feature.bottomFaceIds.length, 1);
  assert.equal(feature.faceIds.length, 2);
  assert.ok(withBottom.featureResult.features[0].excludedAreaMm2 > feature.excludedAreaMm2);
  assert.ok(Math.abs(
    withBottom.featureResult.features[0].excludedAreaMm2
      - feature.excludedAreaMm2
      - Math.PI * 4 ** 2,
  ) <= tolerance);
});

test('stepped hole, countersink and counterbore keep their related segments in one feature', async () => {
  const stepped = (await analyze('stepped_hole.step')).featureResult.features[0];
  const countersunk = (await analyze('countersunk_hole.step')).featureResult.features[0];
  const counterbored = (await analyze('counterbored_hole.step')).featureResult.features[0];
  assert.equal(stepped.segments.length, 3);
  assert.deepEqual(stepped.diametersMm, [6, 10, 14]);
  assert.equal(countersunk.transitionFaceIds.length, 1);
  assert.equal(countersunk.diameterMm, 12);
  assert.equal(counterbored.segments.length, 2);
  assert.deepEqual(counterbored.diametersMm, [6, 14]);
});

test('intersecting holes retain separate stable IDs and remain review-required', async () => {
  const first = await analyze('intersecting_holes.step');
  const second = await analyze('intersecting_holes.step');
  const features = first.featureResult.features;
  assert.equal(features.length, 2);
  assert.equal(new Set(features.map((feature) => feature.featureId)).size, 2);
  assert.ok(features.every((feature) => feature.status === 'review_required'));
  assert.deepEqual(
    features.map((feature) => feature.featureId),
    second.featureResult.features.map((feature) => feature.featureId),
  );
});

test('closed cavity is auto-confirmed, while open cavity and slot are never auto-confirmed', async () => {
  const closed = (await analyze('closed_internal_cavity.step')).featureResult.features;
  const open = (await analyze('open_internal_cavity.step')).featureResult.features;
  const slot = (await analyze('slot_not_hole.step')).featureResult.features;
  assert.equal(closed[0].status, 'confirmed');
  assert.equal(closed[0].closed, true);
  assert.ok(open.every((feature) => feature.status === 'review_required'));
  assert.ok(slot.every((feature) => feature.featureType === 'slot' && feature.status === 'review_required'));
});

test('diameter and depth rules reclassify recognized geometry without changing feature IDs', async () => {
  const baseline = await analyze('through_hole.step');
  const diameterRejected = await analyze('through_hole.step', { featureConfig: { holeMinDiameterMm: 9 } });
  const depthRejected = await analyze('through_hole.step', { featureConfig: { holeMinDepthMm: 21 } });
  assert.equal(baseline.featureResult.features[0].status, 'confirmed');
  assert.equal(diameterRejected.featureResult.features[0].status, 'rejected');
  assert.equal(depthRejected.featureResult.features[0].status, 'rejected');
  assert.equal(baseline.featureResult.features[0].featureId, diameterRejected.featureResult.features[0].featureId);
  assert.equal(baseline.featureResult.features[0].featureId, depthRejected.featureResult.features[0].featureId);
});

test('contact and hole overlap is unioned once on the same B-Rep face', async () => {
  const result = await analyze('contact_and_hole_overlap.step');
  const summary = result.featureResult.summary;
  const expectedOverlap = 2 * Math.PI * 4 * 20;
  assert.ok(Math.abs(summary.rawContactExcludedAreaMm2 - 2 * expectedOverlap) <= tolerance);
  assert.ok(Math.abs(summary.rawFeatureExcludedAreaMm2 - expectedOverlap) <= tolerance);
  assert.ok(Math.abs(summary.overlapAreaMm2 - expectedOverlap) <= tolerance);
  assert.ok(Math.abs(summary.uniqueConfirmedExcludedAreaMm2 - 2 * expectedOverlap) <= tolerance);
  assert.ok(summary.paintableAreaMm2 >= 0);
});
