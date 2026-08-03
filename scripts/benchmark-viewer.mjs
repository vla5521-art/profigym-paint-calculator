import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeStepContent } from '../server/cad/kernel.js';

const fixtures = [
  { path: 'test-models/features/through_hole.step', scenario: 'simple-part' },
  { path: 'test-models/features/multiple_features.step', scenario: 'multiple-features' },
  { path: 'test-models/two_body.step', scenario: 'multi-body' },
  { path: 'test-models/features/contact_and_hole_overlap.step', scenario: 'contact-and-feature' },
  { path: 'test-models/contacts/ten_plates_chain_contacts.step', scenario: 'many-bodies' },
  { path: 'test-models/sphere_r10mm.step', scenario: 'large-curved-mesh', viewerConfig: { linearDeflectionMm: 0.03, angularDeflectionDeg: 2, maxTriangles: 750000 } },
];
const memoryBefore = process.memoryUsage().heapUsed;
const results = [];
for (const fixture of fixtures) {
  const source = await fs.readFile(fixture.path, 'utf8');
  const started = performance.now();
  const result = await analyzeStepContent(source, path.basename(fixture.path), { viewerConfig: fixture.viewerConfig });
  results.push({
    fixture: fixture.path,
    scenario: fixture.scenario,
    stepProcessingMs: Number((performance.now() - started).toFixed(3)),
    meshGenerationMs: result.viewerMesh?.performance.meshGenerationMs ?? 0,
    meshSerializationMs: result.viewerMesh?.performance.meshSerializationMs ?? 0,
    triangleCount: result.viewerMesh?.triangleCount ?? 0,
    meshPayloadBytes: result.viewerMesh?.payloadBytes ?? 0,
    available: result.viewerMesh?.available ?? false,
  });
}
const report = { applicationVersion: '2.0.3', generatedAt: new Date().toISOString(), results, memoryBeforeBytes: memoryBefore, memoryAfterBytes: process.memoryUsage().heapUsed };
await fs.mkdir('diagnostic-reports', { recursive: true });
await fs.writeFile('diagnostic-reports/viewer-benchmark.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
