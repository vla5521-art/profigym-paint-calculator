# Quality Assurance

Этап 7 сохраняет все suites этапа 6: Node unit/integration/API, jsdom, 38 golden STEP, regression, determinism, security, Chromium/WebGL E2E, accessibility, performance, memory, soak, concurrency и migrations.

Добавлены production проверки:

- durable queue: atomic claim, stale recovery, cancellation, worker-down readiness;
- production HTTP smoke: auth, headers, STEP upload, queue/worker, area/features, persistence, mesh, JSON/HTML reports, CAD→ЛКМ, delete, 415 и corrupted STEP;
- observability: JSON logs, request/correlation ID, metrics, heartbeat, absence of high-cardinality labels and secrets;
- backup: consistent backup, SHA-256 manifest, isolated restore, migration/integrity;
- rollback: A/B release marker, verified backup and return to A; distinct binary compatibility is not claimed;
- supply chain: npm audit, CycloneDX SBOM, licenses, secret scan; container scan belongs to Docker/CI environment.

Machine-readable evidence is written to `diagnostic-reports/`, `artifacts/e2e/` and `artifacts/security/`. Missing environment-dependent checks must remain `NOT_RUN`, never synthetic PASS.
