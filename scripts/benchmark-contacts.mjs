import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeStepContent, closeCadKernel } from '../server/cad/kernel.js';

const scenarios = [
  ['2 bodies / one contact', 'two_plates_full_contact.step'],
  ['3 bodies / multiple contacts', 'multiple_contacts.step'],
  ['10 bodies / no contact', 'multi_body_no_contact.step'],
  ['10 bodies / contact chain', 'ten_plates_chain_contacts.step'],
];
const fixtureDir = path.resolve('test-models/contacts');
const results = [];

try {
  for (const [scenario, name] of scenarios) {
    const content = await fs.readFile(path.join(fixtureDir, name), 'utf8');
    const memoryBefore = process.memoryUsage().rss;
    const started = performance.now();
    const result = await analyzeStepContent(content, name);
    const totalMeasuredMs = performance.now() - started;
    const memoryAfter = process.memoryUsage().rss;
    const contact = result.diagnostics.contacts;
    results.push({
      scenario,
      name,
      bodyCount: result.diagnostics.counts.bodies,
      stepImportMs: result.diagnostics.performance.importMs,
      broadPhaseMs: contact.statistics.broadPhaseMs,
      narrowPhaseMs: contact.statistics.narrowPhaseMs,
      contactClassificationMs: contact.statistics.classificationMs,
      contactDetectionMs: contact.statistics.totalContactProcessingMs,
      totalProcessingMeasuredMs: Number(totalMeasuredMs.toFixed(6)),
      potentialBodyPairCount: contact.statistics.potentialBodyPairCount,
      broadPhaseBodyPairCount: contact.statistics.broadPhaseBodyPairCount,
      candidateFacePairCount: contact.statistics.narrowPhaseCandidateCount,
      exactCheckCount: contact.statistics.exactCheckCount,
      contactCount: contact.contacts.length,
      residentMemoryBeforeBytes: memoryBefore,
      residentMemoryAfterBytes: memoryAfter,
      observedResidentMemoryDeltaBytes: Math.max(0, memoryAfter - memoryBefore),
    });
  }
} finally {
  await closeCadKernel();
}

const report = {
  generatedAt: new Date().toISOString(),
  runtime: process.version,
  note: 'RSS is sampled before and after each scenario; it is not a true process peak.',
  results,
};
await fs.mkdir('diagnostic-reports', { recursive: true });
await fs.writeFile('diagnostic-reports/contacts-benchmark.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
