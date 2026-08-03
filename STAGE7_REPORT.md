# STAGE7_REPORT

Версия: 2.0.2. Итоговый статус: **CI_FIXED_READY_FOR_GITHUB**.

## Фактическая архитектура

Nginx proxy → Node app/API → SQLite durable queue → отдельный CAD worker → OCCT/WASM → persistent volumes. Runtime image основан на Node 24.14.0 bookworm-slim, запускается non-root через tini; отдельный `volume-init` подготавливает права named volumes. Image name по умолчанию `profigym-calculator:sha-local`; digest отсутствует, если Docker build/push в этой среде не подтверждён.

Основные Compose-сервисы: `proxy`, `app`, `worker`; опциональные профили: `backup`, `prometheus`, `grafana`, `clamav`. Именованные тома: `database`, `source-files`, `viewer-mesh`, `previews`, `reports`, `backups`, `clamav-db`. Конфигурация подготовлена статически; build и runtime Compose не запускались без Docker.

Queue: `cad_jobs` + `BEGIN IMMEDIATE` atomic claim, heartbeat, stale recovery, bounded retry, idempotency, cooperative cancellation. Default concurrency 1. App limit 1 CPU/768 MiB/150 pids; worker 2 CPU/1536 MiB/200 pids. SQLite: WAL, foreign keys, NORMAL synchronous, 10 s busy timeout, migrations/schema/integrity/checkpoint.

Storage разделён на database/source-files/viewer-mesh/previews/reports/backups и per-job temp. Backup использует consistent VACUUM INTO, SHA-256 manifest и isolated restore-test. Production logs JSON/redacted; correlation ID проходит API→queue→worker; metrics/health/alerts/dashboard подготовлены.

Auth: bearer token или HttpOnly SameSite session; rate limits по категориям; CORS allowlist; CSP/security headers; optional ClamAV profile. CI/CD: Trivy v0.36.0, actionlint, fork-safe build/push/load, SARIF upload, immutable digest deploy, Environment approvals, pre-migration backup и database-aware rollback.

## Реальные результаты

- CI validation/actionlint: PASS; online action tags: PASS.
- Node unit/integration/API: 113; jsdom: 12.
- Golden: 38/38; regression: 35/35; determinism PASS.
- Chromium: 27, PASS; accessibility: 2, PASS.
- Production HTTP smoke: PASS; observability: PASS; backup: PASS; rollback marker: PASS.
- Production-like API/worker: 39 HTTP checks; 24 observability checks; worker-down readiness PASS (503); worker restart PASS (200).
- Backup/restore used 1 saved calculation: summary match PASS, report regeneration PASS, schema 2.
- Supply chain: npm audit 0 vulnerabilities; CycloneDX SBOM 459 components; licenses 459 known / 0 unknown; secret findings 0.
- Benchmark median: small 21.758 ms; medium 35.346 ms; large 269.190 ms. Memory: 20 iterations, heap growth 247123 bytes. Soak: 1415 iterations, 0 errors, 30 s.
- Unicode Excel template: PASS.
- Docker/Compose/image scan: NOT_RUN_DOCKER_UNAVAILABLE; CI/CD remote runs: NOT_RUN_NO_REMOTE_RUN_ID.
- Проверка распакованного ZIP: PASS; Chromium 27/27 PASS; accessibility 2/2 PASS.

Локальный smoke URL `http://127.0.0.1:8899` использовался только во временной тестовой оркестрации и не является production URL. Production URL: отсутствует. CI run IDs: отсутствуют. Remote deployment не выполнялся.

## Ограничения

- Single active deployment and shared SQLite; horizontal replicas require external database/object storage.
- OCCT/WASM cannot be force-terminated in the middle of a synchronous call; cancellation is cooperative between stages.
- Local rollback uses release markers and verified backup, not two distinct image binaries.
- ClamAV is optional and unverified until a safe EICAR test runs.
- No production URL or CI run ID exists in this local package.
