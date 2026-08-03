# Production acceptance checklist — 2.0.2

`actualResult` относится к этому пакету. Docker/VPS/remote GitHub Actions не подменяются локальными результатами.

| id | description | command | actualResult | evidence | status |
|---|---|---|---|---|---|
| P01 | Workflow syntax and expressions | `npm run ci:validate` | actionlint: 3/3 workflow; 31 action references; official tag lookup PASS | `diagnostic-reports/actionlint-results.json`, `ci-validation.json` | PASS |
| P02 | Trivy action | CI validation + official release lookup | `aquasecurity/trivy-action@v0.36.0`; audited SARIF inputs and severity gating | `CI_ACTIONS.md`, `container.yml` | PASS_STATIC |
| P03 | Locked clean install | `npm ci` | 409 packages installed from `package-lock.json` | clean-cycle log | PASS |
| P04 | Node/API + jsdom | `npm test` | Node/API 106/106; jsdom 12/12 | `diagnostic-reports/unit-results.json` | PASS |
| P05 | Geometry regression | golden/regression/determinism | golden 38/38; regression 35/35; 5 in-process + 3 process runs | `diagnostic-reports/*results.json`, `determinism-report.json` | PASS |
| P06 | Security/concurrency | security suites | extended security 26/26; API fuzz 4/4; concurrency 2/2 | `diagnostic-reports/security-results.json`, `concurrency-results.json` | PASS |
| P07 | Build and Unicode template | `npm run build && npm run verify:template` | build PASS; exact Cyrillic filename; source/dist SHA-256 match `0323fb8b03c2a61911104712dc82a4bfc5bf531bf31e67a96f4b99669a9d42e8` | template verifier | PASS |
| P08 | Chromium E2E | `npm run e2e:chromium` | 27/27 | `artifacts/e2e/functional-results.json` | PASS |
| P09 | Accessibility | `npm run e2e:a11y` | 2/2; no critical violations | `artifacts/e2e/a11y-results.json` | PASS |
| P10 | HTTP-only production smoke | `npm run prod:local:verify` | 39/39; liveness/readiness/auth/headers/STEP/queue/worker/area/mesh/reports/CAD→ЛКМ/delete/415/corrupt STEP | `diagnostic-reports/production-smoke.json` | PASS_LOCAL |
| P11 | Separate API/worker | `npm run prod:local:verify` | separate processes; readiness `503→200` across worker restart | `diagnostic-reports/production-like-orchestration.json` | PASS_LOCAL |
| P12 | Observability | production-like verifier | 24/24 | `diagnostic-reports/observability-smoke.json` | PASS_LOCAL |
| P13 | Backup/restore/rollback | production-like + restore tests | real calculation backup PASS; rollback marker PASS; atomic restore with safety copy 3/3 | backup/rollback/migration reports | PASS_LOCAL |
| P14 | Supply chain | `security:audit/sbom/licenses/secrets` | 0 vulnerabilities; SBOM 459 components; licenses 459/459 known; 0 secret findings | `artifacts/security/` | PASS |
| P15 | Dockerfile | static validation | Node 24.14.0 image exists; build/runtime stages, OCCT dependencies, dist/template, tini, non-root and healthcheck audited | `Dockerfile`, `docker-verification.json` | PASS_STATIC |
| P16 | Compose merge/config | `docker compose ... config` | static YAML/service/image/upstream validation PASS; Docker CLI unavailable, so real Compose config NOT RUN | `ci-validation.json`, `docker-verification.json` | NOT_RUN_DOCKER |
| P17 | Docker build/runtime/Trivy | container workflow | workflow prepared; local Docker unavailable | `container.yml`, `docker-verification.json` | NOT_RUN_DOCKER |
| P18 | Fork-safe GHCR | workflow audit | PR loads locally; login/push disabled; push build explicitly pulled before smoke | `container.yml` | PASS_STATIC |
| P19 | Safe production deploy | workflow audit | dispatch-only; secret preflight; Environment approval; immutable digest; backup/migrate/readiness/smoke/rollback | `deploy.yml`, `DEPLOYMENT.md` | PASS_STATIC |
| P20 | Final ZIP recheck | unpack + mandatory clean cycle | clean install, CI validation, tests, build, Chromium 27/27, a11y 2/2, CRC/root/UTF-8 and secret scan PASS | `diagnostic-reports/final-archive-verification.json` | PASS |

Remote GitHub Actions, GHCR push, VPS deployment, real TLS and production URL remain `NOT_RUN` until the owner configures GitHub and production infrastructure.
