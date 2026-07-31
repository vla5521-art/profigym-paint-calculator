import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeStepContent, closeCadKernel } from '../server/cad/kernel.js';
import { reportsDir, root, stableResult, withoutEntityIds, writeJson } from './quality-utils.mjs';

const manifest = JSON.parse(await fs.readFile(path.join(root, 'test-models/golden/golden-manifest.json'), 'utf8'));
const snapshotDir = path.join(root, 'tests/regression/snapshots');
await fs.mkdir(snapshotDir, { recursive: true });
const diffs = [];
const validFixtures = manifest.fixtures.filter((entry) => entry.expectedGeometryStatus === 'valid');
for (const fixture of validFixtures) {
  const content = await fs.readFile(path.join(root, 'test-models/golden', fixture.file), 'utf8');
  const actual = withoutEntityIds(stableResult(await analyzeStepContent(content, fixture.file)));
  const snapshotPath = path.join(snapshotDir, `${fixture.fixtureId}.json`);
  let expected;
  try { expected = JSON.parse(await fs.readFile(snapshotPath, 'utf8')); } catch { expected = null; }
  if (process.env.UPDATE_REGRESSION === '1' || !expected) { await writeJson(snapshotPath, actual); expected = actual; }
  if (JSON.stringify(expected) !== JSON.stringify(actual)) diffs.push({ fixtureId: fixture.fixtureId, expected, actual });
}
await closeCadKernel();
await writeJson(path.join(reportsDir, 'regression-results.json'), { schemaVersion: '1.0.0', suite: 'regression', total: validFixtures.length, failed: diffs.length, passed: validFixtures.length - diffs.length });
if (diffs.length) { await writeJson(path.join(reportsDir, 'regression-diff.json'), { diffs }); throw new Error(`Regression differences: ${diffs.length}`); }
console.log(JSON.stringify({ ok: true, snapshots: validFixtures.length }));
