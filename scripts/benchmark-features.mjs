import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeStepContent, closeCadKernel } from '../server/cad/kernel.js';

const scenarios = [
  'through_hole.step',
  'stepped_hole.step',
  'multiple_features.step',
  'intersecting_holes.step',
  'no_features.step',
  'contact_and_hole_overlap.step',
];
const measurements = [];

try {
  for (const name of scenarios) {
    const content = await fs.readFile(path.join('test-models/features', name), 'utf8');
    const memoryBeforeBytes = process.memoryUsage().rss;
    const started = performance.now();
    const result = await analyzeStepContent(content, name);
    const totalMeasuredMs = performance.now() - started;
    const memoryAfterBytes = process.memoryUsage().rss;
    const performanceData = result.diagnostics.performance;
    const statistics = result.featureResult.statistics;
    measurements.push({
      name,
      stepImportMs: performanceData.importMs,
      candidateExtractionMs: statistics.candidateExtractionMs,
      holeRecognitionMs: statistics.holeRecognitionMs,
      cavityRecognitionMs: statistics.cavityRecognitionMs,
      ruleEvaluationMs: statistics.ruleEvaluationMs,
      overlapResolutionMs: statistics.overlapResolutionMs,
      totalFeatureProcessingMs: statistics.totalFeatureProcessingMs,
      totalMeasuredMs: Number(totalMeasuredMs.toFixed(3)),
      featureCandidateCount: statistics.featureCandidateCount,
      confirmedFeatureCount: statistics.confirmedFeatureCount,
      reviewRequiredCount: statistics.reviewRequiredCount,
      memoryBeforeBytes,
      memoryAfterBytes,
      memoryDeltaBytes: memoryAfterBytes - memoryBeforeBytes,
    });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    version: '2.0.2',
    runtime: process.version,
    note: 'Измерения фактические; искусственный порог успеха не применяется.',
    measurements,
  };
  await fs.mkdir('diagnostic-reports', { recursive: true });
  await fs.writeFile('diagnostic-reports/features-benchmark.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await closeCadKernel();
}
