import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeStepContent, closeCadKernel } from '../server/cad/kernel.js';
import { reportsDir, root, stableResult, writeJson } from './quality-utils.mjs';
const files = ['two_plates_partial_overlap.step','cylindrical_fit.step','multiple_features.step','contact_and_hole_overlap.step','ten_plates_chain_contacts.step'];
const inProcess = {};
for (const file of files) {
  const content = await fs.readFile(path.join(root, 'test-models/golden', file), 'utf8');
  inProcess[file] = [];
  for (let index = 0; index < 5; index += 1) inProcess[file].push(stableResult(await analyzeStepContent(content, file)));
}
await closeCadKernel();
const separate = [];
for (let index = 0; index < 3; index += 1) {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/determinism-worker.mjs'), ...files], { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(run.stderr);
  separate.push(JSON.parse(run.stdout));
}
const mismatches = [];
for (const file of files) {
  const baseline = JSON.stringify(inProcess[file][0]);
  inProcess[file].slice(1).forEach((value, index) => { if (JSON.stringify(value) !== baseline) mismatches.push({ file, scope: `same-process-${index + 2}` }); });
  separate.forEach((value, index) => { if (JSON.stringify(value[file]) !== baseline) mismatches.push({ file, scope: `separate-process-${index + 1}` }); });
}
const report = { schemaVersion: '1.0.0', suite: 'determinism', files, sameProcessRuns: 5, separateProcessRuns: 3, mismatches, status: mismatches.length ? 'FAIL' : 'PASS' };
await writeJson(path.join(reportsDir, 'determinism-report.json'), report);
if (mismatches.length) throw new Error(`Determinism mismatches: ${mismatches.length}`);
console.log(JSON.stringify(report, null, 2));
