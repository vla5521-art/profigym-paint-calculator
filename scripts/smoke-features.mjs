import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeStepContent, closeCadKernel } from '../server/cad/kernel.js';

const scenarios = [
  ['through_hole.step', ['through_hole']],
  ['stepped_hole.step', ['stepped_hole']],
  ['multiple_features.step', ['blind_hole', 'closed_internal_cavity', 'through_hole']],
  ['intersecting_holes.step', ['intersecting_holes', 'intersecting_holes']],
  ['no_features.step', []],
  ['contact_and_hole_overlap.step', ['through_hole']],
];
const results = [];

try {
  for (const [name, expectedTypes] of scenarios) {
    const content = await fs.readFile(path.join('test-models/features', name), 'utf8');
    const result = await analyzeStepContent(content, name);
    assert.equal(result.ok, true, `${name}: STEP analysis failed`);
    assert.deepEqual(
      result.featureResult.features.map((feature) => feature.featureType).sort(),
      [...expectedTypes].sort(),
      `${name}: feature types`,
    );
    assert.ok(result.featureResult.summary.paintableAreaMm2 >= 0, `${name}: negative paintable area`);
    assert.ok(result.featureResult.summary.uniqueConfirmedExcludedAreaMm2 <= result.featureResult.summary.totalAreaMm2 + 0.01);
    if (name === 'intersecting_holes.step') {
      assert.ok(result.featureResult.features.every((feature) => feature.status === 'review_required'));
    }
    if (name === 'contact_and_hole_overlap.step') {
      assert.ok(result.featureResult.summary.overlapAreaMm2 > 0);
    }
    results.push({
      name,
      featureCount: result.featureResult.features.length,
      confirmed: result.featureResult.statistics.confirmedFeatureCount,
      reviewRequired: result.featureResult.statistics.reviewRequiredCount,
      paintableAreaMm2: result.featureResult.summary.paintableAreaMm2,
    });
  }
  console.log(JSON.stringify({ status: 'ok', version: '2.1.1', scenarios: results }, null, 2));
} finally {
  await closeCadKernel();
}
