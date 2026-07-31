import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFeatureConfig, mergeFeatureRules } from '../server/cad/features/config.js';
import { applyFeatureRules } from '../server/cad/features/rules.js';
import { createManualFeature } from '../server/cad/features/service.js';

const baseFeature = {
  featureId: 'feature_1',
  bodyId: 'body_1',
  featureType: 'through_hole',
  faceIds: ['face_side'],
  sideFaceIds: ['face_side'],
  bottomFaceIds: [],
  transitionFaceIds: [],
  openingEdgeIds: ['edge_1', 'edge_2'],
  axis: { originMm: [0, 0, 0], direction: [0, 0, 1] },
  diameterMm: 8,
  radiusMm: 4,
  depthMm: 20,
  through: true,
  accessible: true,
  closed: false,
  confidence: 0.98,
  recognitionReason: 'test',
  segments: [],
  diametersMm: [8],
  depthsMm: [20],
  createdAt: '',
};
const catalog = [
  { id: 'face_side', bodyId: 'body_1', areaMm2: 500 },
  { id: 'face_bottom', bodyId: 'body_1', areaMm2: 50 },
];

test('default feature rules have documented safe ranges and confidence threshold', () => {
  const rules = loadFeatureConfig();
  assert.equal(rules.autoExcludeEnabled, true);
  assert.equal(rules.holeMinDiameterMm, 0.5);
  assert.equal(rules.holeMaxDiameterMm, 1000);
  assert.equal(rules.holeMinDepthMm, 0.5);
  assert.equal(rules.holeMaxDepthMm, 1000);
  assert.equal(rules.confidenceThreshold, 0.9);
  assert.equal(rules.excludeBottomFace, false);
});

test('rule merge validates ranges, unknown fields and types', () => {
  const rules = loadFeatureConfig();
  assert.equal(mergeFeatureRules(rules, { holeMaxDiameterMm: 20 }).holeMaxDiameterMm, 20);
  assert.throws(() => mergeFeatureRules(rules, { unknown: true }));
  assert.throws(() => mergeFeatureRules(rules, { holeMinDiameterMm: 20, holeMaxDiameterMm: 10 }));
  assert.throws(() => mergeFeatureRules(rules, { excludeThrough: 'yes' }));
});

test('rule evaluation separates recognition from technological decision', () => {
  const enabled = applyFeatureRules([baseFeature], loadFeatureConfig(), catalog)[0];
  const disabled = applyFeatureRules([baseFeature], loadFeatureConfig({ excludeThrough: false }), catalog)[0];
  assert.equal(enabled.featureType, disabled.featureType);
  assert.equal(enabled.status, 'confirmed');
  assert.equal(disabled.status, 'rejected');
  assert.equal(enabled.excludedAreaMm2, 500);
  assert.equal(disabled.excludedAreaMm2, 0);
});

test('manual decision overrides automatic rule and reset restores automatic status', () => {
  const rejectedRule = loadFeatureConfig({ excludeThrough: false });
  const manuallyConfirmed = applyFeatureRules([
    { ...baseFeature, manualDecision: 'manually_confirmed' },
  ], rejectedRule, catalog)[0];
  const reset = applyFeatureRules([
    { ...manuallyConfirmed, manualDecision: null },
  ], rejectedRule, catalog)[0];
  assert.equal(manuallyConfirmed.status, 'manually_confirmed');
  assert.equal(manuallyConfirmed.excludedAreaMm2, 500);
  assert.equal(reset.status, 'rejected');
  assert.equal(reset.excludedAreaMm2, 0);
});

test('manual feature uses a deterministic ID and exact selected face area', () => {
  const first = createManualFeature('job_1', ['face_bottom', 'face_side'], catalog);
  const second = createManualFeature('job_1', ['face_side', 'face_bottom'], catalog);
  const evaluated = applyFeatureRules([first], loadFeatureConfig(), catalog)[0];
  assert.equal(first.featureId, second.featureId);
  assert.deepEqual(first.faceIds, ['face_bottom', 'face_side']);
  assert.equal(evaluated.featureType, 'manual_feature');
  assert.equal(evaluated.status, 'manually_confirmed');
  assert.equal(evaluated.excludedAreaMm2, 550);
});
