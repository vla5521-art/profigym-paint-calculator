import fs from 'node:fs/promises';
import path from 'node:path';
import { cadConfig } from '../server/config.js';
import { createBackup, restoreBackupTest, verifyBackup } from '../server/production/backup.js';
import { CalculationRepository } from '../server/cad/calculations/repository.js';
import { createJsonReport } from '../server/cad/reports/service.js';

const base = (process.env.APP_PUBLIC_URL || cadConfig.publicUrl).replace(/\/$/, '');
const token = process.env.PROFIGYM_ACCESS_TOKEN || '';
const headers = token ? { authorization: `Bearer ${token}` } : {};
const step = await fs.readFile('test-models/features/no_features.step');
const form = new FormData(); form.append('file', new Blob([step], { type: 'model/step' }), 'no_features.step');
const upload = await fetch(`${base}/api/cad/import`, { method: 'POST', headers, body: form });
if (upload.status !== 202) throw new Error(`Backup smoke upload failed: ${upload.status}`);
const jobId = (await upload.json()).job.id;
let job;
for (let attempt = 0; attempt < 400; attempt += 1) {
  const response = await fetch(`${base}/api/cad/job/${jobId}`, { headers }); job = (await response.json()).job;
  if (job.status === 'completed') break;
  if (['failed', 'timed_out', 'cancelled'].includes(job.status)) throw new Error(`Backup smoke CAD job ${job.status}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (job?.status !== 'completed') throw new Error('Backup smoke CAD timeout');
const savedResponse = await fetch(`${base}/api/cad/calculations`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ jobId, name: 'Stage 7 backup smoke' }) });
if (savedResponse.status !== 201) throw new Error(`Backup smoke save failed: ${savedResponse.status}`);
const original = (await savedResponse.json()).calculation;
const backup = await createBackup(cadConfig);
const verified = await verifyBackup(cadConfig, backup.manifest.backupId);
const restored = await restoreBackupTest(cadConfig, backup.manifest.backupId);
const repository = new CalculationRepository({ ...cadConfig, databasePath: backup.databaseFile });
let restoredCalculation; let report;
try { restoredCalculation = repository.get(original.calculationId); report = createJsonReport(restoredCalculation); } finally { repository.close(); }
const summaryMatches = JSON.stringify(restoredCalculation.payload.featureSummary) === JSON.stringify(original.featureSummary);
const reportGenerated = report.calculationId === original.calculationId && report.summary.paintableAreaMm2 === original.featureSummary.paintableAreaMm2;
await fetch(`${base}/api/cad/calculations/${original.calculationId}`, { method: 'DELETE', headers });
const result = { applicationVersion: '2.1.1', generatedAt: new Date().toISOString(), status: verified.ok && restored.ok && restored.calculations >= 1 && summaryMatches && reportGenerated ? 'PASS' : 'FAIL', backupId: backup.manifest.backupId, sha256: backup.manifest.sha256, schemaVersion: restored.schemaVersion, calculations: restored.calculations, calculationId: original.calculationId, summaryMatches, reportGenerated, restoredIntoIsolatedDirectory: true };
await fs.mkdir('diagnostic-reports', { recursive: true }); await fs.writeFile(path.join('diagnostic-reports', 'backup-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2)); if (result.status !== 'PASS') process.exitCode = 1;
