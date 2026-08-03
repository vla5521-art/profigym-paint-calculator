# TEST_REPORT — PROFiGYM 2.0.4

Автоматически сформирован: 2026-08-03T05:33:45.867Z. Итог: **PASS**.

- CI validation/actionlint: PASS; Node unit/integration/API: 113; frontend jsdom: 12.
- Golden: 38/38; regression: 35/35; max deviation 0 мм² / 0.
- Chromium: 27; accessibility: 2.
- Production HTTP: 39, PASS; observability: 24, PASS.
- Backup/restore: PASS; rollback marker: PASS.
- Benchmark median: small 21.758 ms; medium 35.346 ms; large 269.190 ms.
- Security: npm audit 0 vulnerabilities; SBOM 459 components; licenses 459 known / 0 unknown; secret findings 0.
- Memory: PASS, 20 iterations, heap growth 247123 bytes. CI-short soak: PASS, 1415 iterations / 0 errors / 30 s.

## Critical

- ciValidation: PASS
- unit: PASS
- golden: PASS
- regression: PASS
- determinism: PASS
- security: PASS
- migrations: PASS
- functionalE2E: PASS
- a11y: PASS
- build: PASS
- unicodeTemplate: PASS
- productionHttpSmoke: PASS
- observabilitySmoke: PASS
- backupRestoreSmoke: PASS
- rollbackSmoke: PASS
- productionOrchestration: PASS
- finalArchiveVerification: PASS
- dependencyAudit: PASS
- secretScan: PASS

## Environment-dependent

- actionlint: PASS
- actionTagVerification: PASS
- dockerBuild: NOT_RUN_DOCKER_UNAVAILABLE
- composeRuntime: NOT_RUN_DOCKER_UNAVAILABLE
- containerScan: NOT_RUN_REQUIRES_DOCKER_OR_CI
- githubActions: NOT_RUN_NO_REMOTE_RUN_ID
- staging: NOT_PUBLISHED
- production: NOT_PUBLISHED
- realTls: NOT_RUN_NO_DOMAIN
- clamavEicar: NOT_RUN
- firefox: NOT_RUN
- webkit: NOT_RUN
