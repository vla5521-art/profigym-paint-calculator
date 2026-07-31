import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzeStepContent } from '../server/cad/kernel.js';
import { CalculationRepository } from '../server/cad/calculations/repository.js';
import { createJsonReport } from '../server/cad/reports/service.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'profigym-persistence-bench-'));
const uploadDir = path.join(root, 'uploads');
await fs.mkdir(uploadDir, { recursive: true });
const storedName = 'source.step';
const sourcePath = 'test-models/features/multiple_features.step';
const source = await fs.readFile(sourcePath, 'utf8');
const memoryBeforeBytes = process.memoryUsage().heapUsed;
const workflowStarted = performance.now();
await fs.writeFile(path.join(uploadDir, storedName), source);
const processingStarted = performance.now();
const result = await analyzeStepContent(source, 'multiple_features.step');
const stepProcessingMs = performance.now() - processingStarted;
const repository = new CalculationRepository({ uploadDir, calculationStoragePath: path.join(root, 'storage'), databasePath: path.join(root, 'calculations.sqlite'), contact: {}, features: {} });
const job = {
  status: 'completed', originalName: 'multiple_features.step', extension: '.step', storedName, size: Buffer.byteLength(source),
  diagnostics: result.diagnostics, contacts: result.contactResult.contacts, contactSummary: result.contactResult.summary, contactStatistics: result.contactResult.statistics,
  features: result.featureResult.features, featureSummary: result.featureResult.summary, featureStatistics: result.featureResult.statistics, featureRules: {}, faceCatalog: result.featureResult.faceCatalog, viewerMesh: result.viewerMesh,
};
const saveStarted = performance.now();
const saved = await repository.createFromJob(job, 'Persistence benchmark');
const databaseSaveMs = performance.now() - saveStarted;
const loadStarted = performance.now();
const loaded = repository.get(saved.id);
await repository.readMesh(loaded);
const databaseLoadMs = performance.now() - loadStarted;
const reportStarted = performance.now();
createJsonReport(loaded);
const reportGenerationMs = performance.now() - reportStarted;
const fullWorkflowMs = performance.now() - workflowStarted;
const report = {
  applicationVersion: '2.0.1', generatedAt: new Date().toISOString(), stepProcessingMs: Number(stepProcessingMs.toFixed(3)),
  databaseSaveMs: Number(databaseSaveMs.toFixed(3)), databaseLoadMs: Number(databaseLoadMs.toFixed(3)), reportGenerationMs: Number(reportGenerationMs.toFixed(3)),
  fullWorkflowMs: Number(fullWorkflowMs.toFixed(3)), memoryBeforeBytes, memoryAfterBytes: process.memoryUsage().heapUsed,
  sourceBytes: Buffer.byteLength(source), meshPayloadBytes: result.viewerMesh.payloadBytes,
};
repository.close();
await fs.rm(root, { recursive: true, force: true });
await fs.mkdir('diagnostic-reports', { recursive: true });
await fs.writeFile('diagnostic-reports/persistence-benchmark.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
