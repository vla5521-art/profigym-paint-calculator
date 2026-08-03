import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeStepContent, closeCadKernel } from '../../server/cad/kernel.js';
import { deviation, reportsDir, root, sha256File, stableResult, writeJson } from '../../scripts/quality-utils.mjs';

const manifest = JSON.parse(await fs.readFile(path.join(root, 'test-models/golden/golden-manifest.json'), 'utf8'));
const results = [];
test.after(async () => { await closeCadKernel(); await writeJson(path.join(reportsDir, 'golden-results.json'), { schemaVersion: '1.0.0', applicationVersion: '2.0.2', suite: 'B-Rep golden', total: results.length, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results }); });

for (const fixture of manifest.fixtures) test(`golden ${fixture.fixtureId}`, async () => {
  const file = path.join(root, 'test-models/golden', fixture.file);
  assert.equal(await sha256File(file), fixture.sha256);
  const result = stableResult(await analyzeStepContent(await fs.readFile(file, 'utf8'), fixture.file));
  const checks = [
    deviation(fixture.expectedTotalAreaMm2, result.totalAreaMm2, fixture.absoluteToleranceMm2, fixture.relativeTolerance),
    deviation(fixture.expectedContactPhysicalAreaMm2, result.areas.contactPhysicalMm2, fixture.absoluteToleranceMm2, fixture.relativeTolerance),
    deviation(fixture.expectedContactExcludedAreaMm2, result.areas.contactExcludedMm2, fixture.absoluteToleranceMm2, fixture.relativeTolerance),
    deviation(fixture.expectedHoleExcludedAreaMm2, result.areas.holeExcludedMm2, fixture.absoluteToleranceMm2, fixture.relativeTolerance),
    deviation(fixture.expectedCavityExcludedAreaMm2, result.areas.cavityExcludedMm2, fixture.absoluteToleranceMm2, fixture.relativeTolerance),
    deviation(fixture.expectedRawExcludedAreaMm2, result.areas.rawExcludedMm2, fixture.absoluteToleranceMm2, fixture.relativeTolerance),
    deviation(fixture.expectedOverlapAreaMm2, result.areas.overlapMm2, fixture.absoluteToleranceMm2, fixture.relativeTolerance),
    deviation(fixture.expectedUniqueExcludedAreaMm2, result.areas.uniqueExcludedMm2, fixture.absoluteToleranceMm2, fixture.relativeTolerance),
    deviation(fixture.expectedPaintableAreaMm2, result.areas.paintableMm2, fixture.absoluteToleranceMm2, fixture.relativeTolerance),
  ];
  const topologyPass = [['bodies','expectedBodies'],['shells','expectedShells'],['faces','expectedFaces'],['edges','expectedEdges'],['vertices','expectedVertices']].every(([key, expected]) => result.counts[key] === fixture[expected]);
  const semanticPass = result.geometryStatus === fixture.expectedGeometryStatus && JSON.stringify(result.warnings) === JSON.stringify(fixture.expectedWarnings) && result.contacts.length === fixture.expectedContacts.length && result.features.length === fixture.expectedFeatures.length;
  const record = { fixtureId: fixture.fixtureId, pass: checks.every((c) => c.pass) && topologyPass && semanticPass, topologyPass, semanticPass, deviations: checks };
  results.push(record);
  console.log(JSON.stringify(record));
  assert.equal(record.pass, true);
});
