import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { root, sha256File, writeJson } from './quality-utils.mjs';

const read = async (file) => { try { return JSON.parse(await fs.readFile(path.join(root, file), 'utf8')); } catch { return null; } };
const exists = async (file) => fs.stat(path.join(root, file)).then(() => true).catch(() => false);
const files = {
  unit: 'diagnostic-reports/unit-results.json', golden: 'diagnostic-reports/golden-results.json', regression: 'diagnostic-reports/regression-results.json', determinism: 'diagnostic-reports/determinism-report.json', security: 'diagnostic-reports/security-results.json', performance: 'diagnostic-reports/performance-results.json', memory: 'diagnostic-reports/memory-report.json', soak: 'diagnostic-reports/soak-report.json', migrations: 'diagnostic-reports/migration-results.json', production: 'diagnostic-reports/production-smoke.json', observability: 'diagnostic-reports/observability-smoke.json', backup: 'diagnostic-reports/backup-smoke.json', rollback: 'diagnostic-reports/rollback-smoke.json', orchestration: 'diagnostic-reports/production-like-orchestration.json', ciValidation: 'diagnostic-reports/ci-validation.json', dockerVerification: 'diagnostic-reports/docker-verification.json', finalArchive: 'diagnostic-reports/final-archive-verification.json', functionalE2E: 'artifacts/e2e/functional-results.json', a11y: 'artifacts/e2e/a11y-results.json', audit: 'artifacts/security/npm-audit.json', sbom: 'artifacts/security/sbom.cdx.json', licenses: 'artifacts/security/dependency-licenses.json', secrets: 'artifacts/security/secret-scan.json',
};
const data = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await read(file)])));
const playwright = (value) => value ? { suites: value.suites?.length ?? 0, tests: (value.suites ?? []).flatMap((suite) => suite.specs ?? []).length, errors: value.errors?.length ?? 0, status: (value.errors?.length ?? 0) === 0 ? 'PASS' : 'FAIL' } : null;
const resultStatus = (value) => !value ? null : (value.status ?? (typeof value.failed === 'number' ? (value.failed === 0 ? 'PASS' : 'FAIL') : 'PASS'));
const critical = {
  ciValidation: resultStatus(data.ciValidation), unit: resultStatus(data.unit), golden: resultStatus(data.golden), regression: resultStatus(data.regression), determinism: resultStatus(data.determinism), security: resultStatus(data.security), migrations: resultStatus(data.migrations), functionalE2E: playwright(data.functionalE2E)?.status ?? null, a11y: playwright(data.a11y)?.status ?? null,
  build: await exists('dist/index.html') ? 'PASS' : null, unicodeTemplate: await exists('dist/templates/PROFiGYM_шаблон_импорта.xlsx') ? 'PASS' : null,
  productionHttpSmoke: resultStatus(data.production), observabilitySmoke: resultStatus(data.observability), backupRestoreSmoke: resultStatus(data.backup), rollbackSmoke: resultStatus(data.rollback), productionOrchestration: resultStatus(data.orchestration), finalArchiveVerification: resultStatus(data.finalArchive), dependencyAudit: resultStatus(data.audit), secretScan: resultStatus(data.secrets),
};
const missing = Object.entries(critical).filter(([, status]) => !status).map(([key]) => key);
const failed = Object.entries(critical).filter(([, status]) => status === 'FAIL').map(([key]) => key);
const overallStatus = failed.length ? 'FAIL' : missing.length ? 'PASS_WITH_LIMITATIONS' : 'PASS';
const manifestPath = path.join(root, 'test-models/golden/golden-manifest.json'); const manifest = await read('test-models/golden/golden-manifest.json');
const dockerAvailable = await new Promise((resolve) => import('node:child_process').then(({ execFile }) => execFile('docker', ['version'], (error) => resolve(!error))));
const report = {
  applicationVersion: '2.0.4', testReportSchemaVersion: '1.2.0', generatedAt: new Date().toISOString(), nodeVersion: process.version, os: os.platform(), architecture: os.arch(), gitCommit: process.env.GITHUB_SHA ?? null,
  fixtureManifestHash: await sha256File(manifestPath), fixtureCount: manifest?.fixtures?.length ?? 0,
  testCounts: { nodeUnitIntegration: data.unit?.nodeTests ?? 0, frontendJsdom: data.unit?.frontendTests ?? 0, golden: data.golden?.total ?? 0, regression: data.regression?.total ?? 0, security: data.security?.total ?? 0, migrations: data.migrations?.total ?? 0, functionalBrowser: playwright(data.functionalE2E)?.tests ?? 0, accessibility: playwright(data.a11y)?.tests ?? 0, productionHttp: data.production?.tests ?? 0, observability: data.observability?.tests ?? 0 },
  critical, extended: { performance: resultStatus(data.performance), memory: resultStatus(data.memory), soak: resultStatus(data.soak) }, production: { http: data.production, observability: data.observability, backup: data.backup, rollback: data.rollback, orchestration: data.orchestration },
  supplyChain: { vulnerabilities: data.audit?.vulnerabilities ?? null, sbomComponents: data.sbom?.components?.length ?? 0, licensedPackages: data.licenses?.packages?.length ?? 0, unknownLicenses: data.licenses?.packages?.filter((item) => item.license === 'UNKNOWN').length ?? 0, secretFindings: data.secrets?.findings?.length ?? 0 },
  environmentDependent: { actionlint: data.ciValidation?.actionlint ?? 'NOT_RUN', actionTagVerification: data.ciValidation?.actionTagVerification ?? 'NOT_RUN', dockerBuild: data.dockerVerification?.dockerBuild ?? (dockerAvailable ? 'AVAILABLE_NOT_INFERRED' : 'NOT_RUN_DOCKER_UNAVAILABLE'), composeRuntime: data.dockerVerification?.productionSmoke ?? (dockerAvailable ? 'AVAILABLE_NOT_INFERRED' : 'NOT_RUN_DOCKER_UNAVAILABLE'), containerScan: 'NOT_RUN_REQUIRES_DOCKER_OR_CI', githubActions: 'NOT_RUN_NO_REMOTE_RUN_ID', staging: 'NOT_PUBLISHED', production: 'NOT_PUBLISHED', realTls: 'NOT_RUN_NO_DOMAIN', clamavEicar: 'NOT_RUN', firefox: 'NOT_RUN', webkit: 'NOT_RUN' },
  knownLimitations: ['Single active deployment and shared SQLite; horizontal replicas require external database/object storage.', 'OCCT/WASM cannot be force-terminated in the middle of a synchronous call; cancellation is cooperative between stages.', 'Local rollback uses release markers and verified backup, not two distinct image binaries.', 'ClamAV is optional and unverified until a safe EICAR test runs.', 'No production URL or CI run ID exists in this local package.'],
  missingCritical: missing, failedCritical: failed, overallStatus,
};
await writeJson(path.join(root, 'diagnostic-reports/test-report.json'), report);
const deviations = data.golden?.results?.flatMap((item) => item.deviations ?? []) ?? [];
const maxAbs = Math.max(0, ...deviations.map((item) => Number(item.absoluteDeviation) || 0)); const maxRel = Math.max(0, ...deviations.map((item) => Number.isFinite(item.relativeDeviation) ? item.relativeDeviation : 0));
const medians = Object.fromEntries(Object.entries(data.performance?.results ?? {}).map(([key, value]) => [key, value.stages?.fullWorkflowMs?.median]));
const memoryGrowth = Number(data.memory?.growthBytes ?? 0);
const testReport = `# TEST_REPORT — PROFiGYM 2.0.4

Автоматически сформирован: ${report.generatedAt}. Итог: **${overallStatus}**.

- CI validation/actionlint: ${critical.ciValidation ?? 'NOT_RUN'}; Node unit/integration/API: ${report.testCounts.nodeUnitIntegration}; frontend jsdom: ${report.testCounts.frontendJsdom}.
- Golden: ${data.golden?.passed ?? 0}/${data.golden?.total ?? 0}; regression: ${data.regression?.passed ?? 0}/${data.regression?.total ?? 0}; max deviation ${maxAbs} мм² / ${maxRel}.
- Chromium: ${report.testCounts.functionalBrowser}; accessibility: ${report.testCounts.accessibility}.
- Production HTTP: ${report.testCounts.productionHttp}, ${critical.productionHttpSmoke ?? 'NOT_RUN'}; observability: ${report.testCounts.observability}, ${critical.observabilitySmoke ?? 'NOT_RUN'}.
- Backup/restore: ${critical.backupRestoreSmoke ?? 'NOT_RUN'}; rollback marker: ${critical.rollbackSmoke ?? 'NOT_RUN'}.
- Benchmark median: small ${medians.small?.toFixed(3) ?? 'n/a'} ms; medium ${medians.medium?.toFixed(3) ?? 'n/a'} ms; large ${medians.large?.toFixed(3) ?? 'n/a'} ms.
- Security: npm audit ${data.audit?.vulnerabilities?.total ?? 'n/a'} vulnerabilities; SBOM ${data.sbom?.components?.length ?? 0} components; licenses ${data.licenses?.packages?.length ?? 0} known / ${data.licenses?.packages?.filter((item) => item.license === 'UNKNOWN').length ?? 0} unknown; secret findings ${data.secrets?.findings?.length ?? 0}.
- Memory: ${resultStatus(data.memory) ?? 'NOT_RUN'}, ${data.memory?.iterations ?? 0} iterations, heap growth ${Math.round(memoryGrowth)} bytes. CI-short soak: ${resultStatus(data.soak) ?? 'NOT_RUN'}, ${data.soak?.iterations ?? 0} iterations / ${data.soak?.errors ?? 0} errors / ${Math.round((data.soak?.durationMs ?? 0) / 1000)} s.

## Critical

${Object.entries(critical).map(([key, status]) => `- ${key}: ${status ?? 'NOT_RUN'}`).join('\n')}

## Environment-dependent

${Object.entries(report.environmentDependent).map(([key, status]) => `- ${key}: ${status}`).join('\n')}
`;
await fs.writeFile(path.join(root, 'TEST_REPORT.md'), testReport, 'utf8');
const stageStatus = overallStatus === 'FAIL' ? 'FAIL' : data.dockerVerification?.status === 'PASS' ? 'CI_FIXED_DOCKER_VERIFIED' : 'CI_FIXED_READY_FOR_GITHUB';
const stage = `# STAGE7_REPORT

Версия: 2.0.4. Итоговый статус: **${stageStatus}**.

## Фактическая архитектура

Nginx proxy → Node app/API → SQLite durable queue → отдельный CAD worker → OCCT/WASM → persistent volumes. Runtime image основан на Node 24.18.1 bookworm-slim, запускается non-root через tini; отдельный \`volume-init\` подготавливает права named volumes. Image name по умолчанию \`profigym-calculator:sha-local\`; digest отсутствует, если Docker build/push в этой среде не подтверждён.

Основные Compose-сервисы: \`proxy\`, \`app\`, \`worker\`; опциональные профили: \`backup\`, \`prometheus\`, \`grafana\`, \`clamav\`. Именованные тома: \`database\`, \`source-files\`, \`viewer-mesh\`, \`previews\`, \`reports\`, \`backups\`, \`clamav-db\`. Конфигурация подготовлена статически; build и runtime Compose не запускались без Docker.

Queue: \`cad_jobs\` + \`BEGIN IMMEDIATE\` atomic claim, heartbeat, stale recovery, bounded retry, idempotency, cooperative cancellation. Default concurrency 1. App limit 1 CPU/768 MiB/150 pids; worker 2 CPU/1536 MiB/200 pids. SQLite: WAL, foreign keys, NORMAL synchronous, 10 s busy timeout, migrations/schema/integrity/checkpoint.

Storage разделён на database/source-files/viewer-mesh/previews/reports/backups и per-job temp. Backup использует consistent VACUUM INTO, SHA-256 manifest и isolated restore-test. Production logs JSON/redacted; correlation ID проходит API→queue→worker; metrics/health/alerts/dashboard подготовлены.

Auth: bearer token или HttpOnly SameSite session; rate limits по категориям; CORS allowlist; CSP/security headers; optional ClamAV profile. CI/CD: Trivy v0.36.0, actionlint, fork-safe build/push/load, SARIF upload, immutable digest deploy, Environment approvals, pre-migration backup и database-aware rollback.

## Реальные результаты

- CI validation/actionlint: ${critical.ciValidation ?? 'NOT_RUN'}; online action tags: ${data.ciValidation?.actionTagVerification ?? 'NOT_RUN'}.
- Node unit/integration/API: ${report.testCounts.nodeUnitIntegration}; jsdom: ${report.testCounts.frontendJsdom}.
- Golden: ${data.golden?.passed ?? 0}/${data.golden?.total ?? 0}; regression: ${data.regression?.passed ?? 0}/${data.regression?.total ?? 0}; determinism ${critical.determinism ?? 'NOT_RUN'}.
- Chromium: ${report.testCounts.functionalBrowser}, ${critical.functionalE2E ?? 'NOT_RUN'}; accessibility: ${report.testCounts.accessibility}, ${critical.a11y ?? 'NOT_RUN'}.
- Production HTTP smoke: ${critical.productionHttpSmoke ?? 'NOT_RUN'}; observability: ${critical.observabilitySmoke ?? 'NOT_RUN'}; backup: ${critical.backupRestoreSmoke ?? 'NOT_RUN'}; rollback marker: ${critical.rollbackSmoke ?? 'NOT_RUN'}.
- Production-like API/worker: ${report.testCounts.productionHttp} HTTP checks; ${report.testCounts.observability} observability checks; worker-down readiness ${data.orchestration?.workerDownReadinessStatus === 503 ? 'PASS (503)' : 'NOT_RUN'}; worker restart ${data.orchestration?.workerRestartReadinessStatus === 200 ? 'PASS (200)' : 'NOT_RUN'}.
- Backup/restore used ${data.backup?.calculations ?? 0} saved calculation: summary match ${data.backup?.summaryMatches === true ? 'PASS' : 'NOT_RUN'}, report regeneration ${data.backup?.reportGenerated === true ? 'PASS' : 'NOT_RUN'}, schema ${data.backup?.schemaVersion ?? 'n/a'}.
- Supply chain: npm audit ${data.audit?.vulnerabilities?.total ?? 'n/a'} vulnerabilities; CycloneDX SBOM ${data.sbom?.components?.length ?? 0} components; licenses ${data.licenses?.packages?.length ?? 0} known / ${data.licenses?.packages?.filter((item) => item.license === 'UNKNOWN').length ?? 0} unknown; secret findings ${data.secrets?.findings?.length ?? 0}.
- Benchmark median: small ${medians.small?.toFixed(3) ?? 'n/a'} ms; medium ${medians.medium?.toFixed(3) ?? 'n/a'} ms; large ${medians.large?.toFixed(3) ?? 'n/a'} ms. Memory: ${data.memory?.iterations ?? 0} iterations, heap growth ${Math.round(memoryGrowth)} bytes. Soak: ${data.soak?.iterations ?? 0} iterations, ${data.soak?.errors ?? 0} errors, ${Math.round((data.soak?.durationMs ?? 0) / 1000)} s.
- Unicode Excel template: ${critical.unicodeTemplate ?? 'NOT_RUN'}.
- Docker/Compose/image scan: ${report.environmentDependent.dockerBuild}; CI/CD remote runs: ${report.environmentDependent.githubActions}.
- Проверка распакованного ZIP: ${critical.finalArchiveVerification ?? 'NOT_RUN'}; Chromium ${data.finalArchive?.checks?.chromium ?? 'NOT_RUN'}; accessibility ${data.finalArchive?.checks?.accessibility ?? 'NOT_RUN'}.

Локальный smoke URL \`http://127.0.0.1:8899\` использовался только во временной тестовой оркестрации и не является production URL. Production URL: отсутствует. CI run IDs: отсутствуют. Remote deployment не выполнялся.

## Ограничения

${report.knownLimitations.map((item) => `- ${item}`).join('\n')}
`;
await fs.writeFile(path.join(root, 'STAGE7_REPORT.md'), stage, 'utf8');
console.log(JSON.stringify({ overallStatus, stageStatus, report: 'TEST_REPORT.md', stageReport: 'STAGE7_REPORT.md' }, null, 2));
