# Production acceptance checklist

`actualResult` и `evidence` описывают именно этот пакет. Проверки, требующие Docker, VPS, домена или удалённого CI, не подменяются локальными результатами.

| id | description | criticality | command | expectedResult | actualResult | evidence | status |
|---|---|---|---|---|---|---|---|
| P01 | STEP-only/API 415 | critical | `npm run prod:local:verify` | STEP completes; SLDPRT=415 | 40/40 HTTP-проверок; реальный STEP завершён, SLDPRT отклонён 415 | `diagnostic-reports/production-smoke.json` | PASS |
| P02 | Durable queue/worker | critical | `npm test && npm run prod:local:verify` | atomic claim, stale recovery, worker-down readiness | Queue/retry/heartbeat тесты прошли; отдельный worker остановлен: readiness 503, после рестарта 200 | `diagnostic-reports/production-like-orchestration.json` | PASS |
| P03 | Non-root image | critical | `docker compose build` | USER node, healthy image | Docker отсутствует; Dockerfile статически содержит multi-stage, `USER node`, tini | `Dockerfile` | NOT_RUN |
| P04 | Compose app/worker/proxy | critical | `npm run prod:up` | all healthy | Docker отсутствует; runtime Compose не запускался | `compose.yml`, `compose.production.yml` | NOT_RUN |
| P05 | Resource/storage limits | high | `docker compose config` | bounded CPU/RAM/pids, read-only, volumes | Статически заданы CPU/RAM/pids, read-only rootfs, tmpfs и раздельные named volumes; `docker compose config` недоступен | compose files | READY_STATIC |
| P06 | SQLite/integrity | critical | `npm run db:migrate && npm run db:integrity` | schema 2, WAL, integrity ok | schema 2, WAL, foreign keys и integrity `ok` | `diagnostic-reports/migration-results.json` | PASS |
| P07 | Backup/restore | critical | `npm run prod:local:verify` | hash + isolated restore PASS | Реальный сохранённый расчёт: SHA-256 manifest, isolated restore, summary match и report regeneration PASS | `diagnostic-reports/backup-smoke.json` | PASS |
| P08 | Logs/correlation/metrics | high | `npm run prod:local:verify` | PASS | 24/24: JSON logs, request/correlation IDs, redaction и обязательные Prometheus series | `diagnostic-reports/observability-smoke.json` | PASS |
| P09 | Auth/rate/CORS/headers | critical | `npm run prod:local:verify` | anonymous 401; headers present | Anonymous API 401; CORS/rate/security headers проверены локально и unit/API-тестами | production smoke, node test report | PASS |
| P10 | Chromium E2E/a11y | critical | `npm run e2e:chromium && npm run e2e:a11y` | all pass | Chromium 27/27, accessibility 2/2 | `artifacts/e2e/*.json` | PASS |
| P11 | Supply chain | high | `npm run security:audit && npm run security:sbom && npm run security:licenses && npm run security:secrets` | no blocking findings | audit 0; CycloneDX 457 components; licenses 457/457 known; secrets 0 | `artifacts/security` | PASS |
| P12 | Container vulnerability scan | high | GitHub container workflow | Trivy pass | Docker/remote CI unavailable | `.github/workflows/container.yml` | NOT_RUN |
| P13 | Production rollback | critical | `npm run prod:local:verify` | marker/backup return PASS | Локальный release-marker и backup rollback PASS; два фактически разных image digest не проверялись | `diagnostic-reports/rollback-smoke.json` | PASS_LOCAL_MARKER |
| P14 | Real VPS rollback | critical | `scripts/rollback-vps.sh` | previous digest + data intact | VPS credentials и опубликованные images отсутствуют | runbook | NOT_RUN |
| P15 | TLS/real URL | critical | `curl -I https://DOMAIN` | trusted TLS + HSTS | Домен не предоставлен; production URL отсутствует | deployment evidence | NOT_RUN |
| P16 | Unicode Excel template | critical | `npm run verify:template` | name/hash/XLSX/UTF-8 pass | Кириллическое имя, XLSX CRC и SHA-256 `0323fb8b03c2a61911104712dc82a4bfc5bf531bf31e67a96f4b99669a9d42e8` подтверждены | template verification | PASS |
| P17 | Final ZIP recheck | critical | unpack and repeat checks | pass from extracted package | Fresh extraction: 407 packages installed, full non-Docker critical cycle PASS, Chromium 27/27, a11y 2/2, CRC/root/UTF-8 PASS | `diagnostic-reports/final-archive-verification.json` | PASS |
