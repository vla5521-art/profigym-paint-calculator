# PROFiGYM calculator v2.1.0 — итоговый отчёт Этапа 8

Дата проверки: 2026-08-04.

## Итог

Исходный проект из архива Этапа 7 подготовлен как release candidate v2.1.0. Документация актуализирована, активные ссылки на удалённые функции отсутствуют, CAD baseline полностью совпадает, все локальные unit/integration/browser/production-like проверки прошли.

Docker-команды были повторно запущены в текущей среде, но завершились до обращения к проекту: Docker CLI, совместимый контейнерный движок и Docker socket отсутствуют. Поэтому окончательный статус остаётся **READY_FOR_DOCKER_ACCEPTANCE**. Выпуск в промышленную эксплуатацию можно подтвердить только после успешных `docker compose build`, `docker compose up` и `npm run smoke:production` на Docker-хосте.

## Изменения

- Обновлены `README.md`, `DEPLOYMENT.md`, `RUNBOOK.md`, `PRODUCTION_CHECKLIST.md` и `PAINT_CALCULATOR_INTEGRATION.md` для release candidate 2.1.0.
- В `CHANGELOG.md` добавлен новый раздел 2.1.0; прежние разделы не редактировались.
- Из актуальных тестовых отчётов удалена устаревшая ссылка `unicodeTemplate`; генератор отчётов не содержал зависимостей от удалённых функций и не менялся.
- `.env.example` и `.env.production.example` проверены: переменных удалённого функционала нет, поэтому файлы оставлены без изменений.
- Исходный код приложения, CAD-алгоритмы, API, сервер, SQLite, Docker-конфигурация и PaintIntegration не изменялись.

## Изменённые файлы

Ручные изменения:

- `README.md`
- `CHANGELOG.md`
- `PRODUCTION_CHECKLIST.md`
- `RUNBOOK.md`
- `DEPLOYMENT.md`
- `PAINT_CALCULATOR_INTEGRATION.md`
- `TEST_REPORT.md`
- `diagnostic-reports/test-report.json`
- `diagnostic-reports/final-archive-verification.json`
- `RELEASE_REPORT_v2.1.0.md`

Автоматически обновлены текущими прогонами:

- `diagnostic-reports/actionlint-results.json`
- `diagnostic-reports/ci-validation.json`
- `diagnostic-reports/unit-results.json`
- `diagnostic-reports/node-test-results.json`
- `diagnostic-reports/vitest-results.json`
- `diagnostic-reports/golden-results.json`
- `diagnostic-reports/regression-results.json`
- `diagnostic-reports/determinism-report.json`
- `diagnostic-reports/smoke-summary.json` и модельные live-smoke JSON
- `diagnostic-reports/production-smoke.json`
- `diagnostic-reports/production-like-orchestration.json`
- `diagnostic-reports/observability-smoke.json`
- `diagnostic-reports/backup-smoke.json`
- `diagnostic-reports/rollback-smoke.json`
- `artifacts/e2e/functional-results.json`, `artifacts/e2e/a11y-results.json` и контрольные screenshots
- `artifacts/security/secret-scan.json`

## Результаты команд

| Команда | Результат |
|---|---|
| `npm install` | PASS — 409 пакетов; первый запуск остановился из-за недоступного `/root/.npm`, повтор с отдельным временным cache прошёл; lock-файл не изменён |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — Node/API 115/115, frontend 25/25 |
| `npm run test:node` | PASS — 115/115 |
| `npm run test:frontend` | PASS — 25/25 |
| `npm run build` | PASS |
| `npm run smoke:live` | PASS |
| `npm run test:golden` | PASS — 38/38, отклонение площадей 0 |
| `npm run test:regression` | PASS — 35/35 |
| `npm run test:determinism` | PASS — 5 запусков в одном процессе + 3 отдельных, расхождений 0 |
| `npm run smoke:workflow` | PASS — 12/12 |
| `npm run e2e:chromium` | PASS — полный CI-прогон 42/42; два отдельных сценария повторно PASS 2/2. Два предшествующих локальных прогона дали по одному различному инфраструктурному тайм-ауту (41/42), оба сценария затем прошли без изменения кода |
| `npm run e2e:a11y` | PASS — 2/2, критических нарушений нет |
| `npm run ci:validate` | PASS — 3 workflow, 33 action references; online tag lookup пропущен после сетевого timeout |
| `npm run security:secrets` | PASS — 0 находок |
| `npm run prod:local:verify` | PASS — production HTTP 39/39, observability 24/24, отдельные app/worker, auth, STEP, очередь, сохранение/открытие, CAD → ЛКМ, backup/restore и rollback |
| `docker compose build` | BLOCKED — команда запущена, Docker CLI отсутствует, exit 127 (`docker: command not found`) |
| `docker compose up` | BLOCKED — команда запущена, Docker CLI отсутствует, exit 127 (`docker: command not found`) |
| `npm run smoke:production` | FAIL — `ECONNREFUSED 127.0.0.1:8787`, так как контейнеры не были запущены; тот же smoke внутри `prod:local:verify` — PASS 39/39 |

Все перечисленные npm-команды существуют в `package.json`; искусственные команды не добавлялись. `npm run test:report` не запускался, чтобы не перезаписывать исторический `STAGE7_REPORT.md`.

## Ручные сценарии

| Сценарий | Результат и доказательство |
|---|---|
| 1. Загрузка STEP и расчёт | PASS — Chromium и production-like HTTP |
| 2. Совпадение площадей с baseline | PASS — Golden 38/38, Regression 35/35, нулевые отклонения |
| 3. Передача площади в ЛКМ | PASS — Chromium, workflow и production smoke |
| 4. Ручная норма и коэффициент потерь | PASS — реальный Chromium и frontend tests |
| 5. Новый расчёт: две площади и «Подробнее» | PASS — Stage 6 Chromium scenarios |
| 6. Сохранённый расчёт: повторное открытие, две площади и «Подробнее» | PASS — Stage 7 Chromium scenarios |
| 7. Confirm / Reject / Reset / Manual Feature | PASS — Chromium и API/integration tests |
| 8. Сохранение / открытие / отчёты / передача / Docker | PASS для сохранения, открытия, JSON/HTML-отчётов и передачи; Docker BLOCKED из-за отсутствия CLI/daemon/socket |

## Неизменность и baseline

- 49 защищённых файлов совпадают с архивом Этапа 7 побайтово: `src/cad`, весь `server`, CAD API, SQLite, `package.json`, `package-lock.json`, Dockerfile и Compose-файлы.
- Все существовавшие исторические `STAGE*_REPORT.md` совпадают с исходным архивом побайтово.
- Golden manifest и regression snapshots не обновлялись.
- Геометрическая, окрашиваемая, контактная, feature/cavity и ручная площади совпадают с baseline; determinism не выявил расхождений.

## Release gate

Локальный код и архив готовы. Единственный незакрытый обязательный gate — фактический Docker build/runtime smoke. Команды запуска проекта не выявили дефекта: они не могли начаться без контейнерного движка. До реального прохождения Docker-проверки нельзя подтверждать критерии «Docker успешно собирается и запускается» и «полностью готов к промышленной эксплуатации».

## Повторная проверка Docker Release Gate

Повтор выполнен 2026-08-04 строго из архива `PROFiGYM_calculator_v2.1.0(1).zip` с SHA-256 `f13caef3359e0484016bb7b4a26173283c6fde03a448991f665b85006bb648f5`.

- Docker CLI: отсутствует.
- Совместимые движки `podman`, `nerdctl`, `finch`, `docker-compose`: отсутствуют.
- Docker socket `/var/run/docker.sock` и `/run/docker.sock`: отсутствует.
- `docker compose build`: exit 127.
- `docker compose up`: exit 127.
- `npm run smoke:production`: exit 1, `ECONNREFUSED 127.0.0.1:8787`.
- `npm run prod:local:verify`: PASS; production smoke 39/39 и observability 24/24.

Изменения кода, интерфейса, алгоритмов, API, SQLite, Docker-конфигурации и документации приложения не выполнялись. В поставке обновлён только этот итоговый отчёт.
