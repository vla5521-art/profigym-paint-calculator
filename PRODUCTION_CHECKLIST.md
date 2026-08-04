# Production acceptance checklist — 2.1.0

`actualResult` относится к этому пакету. Docker/VPS/remote GitHub Actions не подменяются локальными результатами.

| id | description | command | actualResult | evidence | status |
|---|---|---|---|---|---|
| P01 | Workflow syntax and expressions | `npm run ci:validate` | actionlint: 3/3 workflow; 33 action references; static validation PASS; online tag lookup skipped after network timeout | `diagnostic-reports/actionlint-results.json`, `ci-validation.json` | PASS_WITH_NETWORK_LIMITATION |
| P02 | Trivy action | CI validation + official release lookup | `aquasecurity/trivy-action@v0.36.0`; audited SARIF inputs and severity gating | `CI_ACTIONS.md`, `container.yml` | PASS_STATIC |
| P03 | Dependency install | `npm install` | 409 packages installed; `package-lock.json` unchanged | Stage 8 command log | PASS |
| P04 | Node/API + jsdom | `npm test` | Node/API 115/115; jsdom 25/25 | `diagnostic-reports/unit-results.json` | PASS |
| P05 | Geometry regression | golden/regression/determinism | golden 38/38; regression 35/35; 5 in-process + 3 process runs | `diagnostic-reports/*results.json`, `determinism-report.json` | PASS |
| P06 | Security/concurrency | security suites | extended security 26/26; API fuzz 4/4; concurrency 2/2 | `diagnostic-reports/security-results.json`, `concurrency-results.json` | PASS |
| P07 | Frontend build | `npm run build` | production build PASS | Vite build output | PASS |
| P08 | Chromium E2E | `npm run e2e:chromium` | 42/42 | `artifacts/e2e/functional-results.json` | PASS |
| P09 | Accessibility | `npm run e2e:a11y` | 2/2; no critical violations | `artifacts/e2e/a11y-results.json` | PASS |
| P10 | HTTP-only production smoke | `npm run prod:local:verify` | 39/39; liveness/readiness/auth/headers/STEP/queue/worker/area/mesh/reports/CAD→ЛКМ/delete/415/corrupt STEP | `diagnostic-reports/production-smoke.json` | PASS_LOCAL |
| P11 | Separate API/worker | `npm run prod:local:verify` | separate processes; readiness `503→200` across worker restart | `diagnostic-reports/production-like-orchestration.json` | PASS_LOCAL |
| P12 | Observability | production-like verifier | 24/24 | `diagnostic-reports/observability-smoke.json` | PASS_LOCAL |
| P13 | Backup/restore/rollback | production-like + restore tests | real calculation backup PASS; rollback marker PASS; atomic restore with safety copy 3/3 | backup/rollback/migration reports | PASS_LOCAL |
| P14 | Supply chain | `security:audit/sbom/licenses/secrets` | 0 vulnerabilities; SBOM 459 components; licenses 459/459 known; 0 secret findings | `artifacts/security/` | PASS |
| P15 | Dockerfile | static validation | Node 24.18.1 bookworm-slim tag confirmed; build/runtime stages, OCCT dependencies, dist, tini, non-root and healthcheck audited | `Dockerfile`, `docker-verification.json` | PASS_STATIC |
| P16 | Compose merge/config | `docker compose ... config` | static YAML/service/image/upstream validation PASS; Docker CLI unavailable, so real Compose config NOT RUN | `ci-validation.json`, `docker-verification.json` | NOT_RUN_DOCKER |
| P17 | Docker build/runtime/Trivy | `docker compose build`, `docker compose up`, container workflow | команды запрошены, но Docker CLI отсутствует (`exit 127`); конфигурация совпадает с Этапом 7 побайтово | `container.yml`, итоговый отчёт Этапа 8 | NOT_RUN_DOCKER |
| P18 | Fork-safe GHCR | workflow audit | PR loads locally; login/push disabled; push build explicitly pulled before smoke | `container.yml` | PASS_STATIC |
| P19 | Safe production deploy | workflow audit | dispatch-only; secret preflight; Environment approval; immutable digest; backup/migrate/readiness/smoke/rollback | `deploy.yml`, `DEPLOYMENT.md` | PASS_STATIC |
| P20 | Final ZIP recheck | unpack + mandatory clean cycle | CRC/root/exclusions/unpack PASS; clean install 409 packages, lint, typecheck, build and secret scan PASS | `diagnostic-reports/final-archive-verification.json`, итоговый отчёт Этапа 8 | PASS |
| P21 | Новый и сохранённый CAD-результат | Chromium E2E + ручная проверка | две основные площади видимы; диагностика и действия доступны через «Подробнее» | `artifacts/e2e/functional-results.json`, итоговый отчёт Этапа 8 | PASS |
| P22 | CAD → ЛКМ | workflow/Chromium/production smoke | передача окрашиваемой площади, ручная норма, коэффициент потерь и итоговый расход подтверждены | `diagnostic-reports/production-smoke.json`, итоговый отчёт Этапа 8 | PASS_LOCAL |

Remote GitHub Actions, GHCR push, VPS deployment, real TLS and production URL remain `NOT_RUN` until the owner configures GitHub and production infrastructure.
