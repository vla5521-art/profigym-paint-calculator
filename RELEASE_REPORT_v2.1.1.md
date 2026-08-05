# PROFiGYM calculator v2.1.1 — Release Gate

Дата проверки: 2026-08-05.

Исходный архив: `PROFiGYM_calculator_v2.1.0(4).zip`  
SHA-256 исходного архива: `4d1c5e339535917a238626b9a4824105a5695f3797e161f916f864497f65497b`.

## Изменения

- В обоих Dockerfile cache mount для `npm ci` добавлен `sharing=locked`.
- Оба `npm ci` используют `--prefer-offline`, `--maxsockets=1`, 10 повторов и увеличенные сетевые тайм-ауты.
- Build-стадия не получила `--ignore-scripts`; production dependencies сохранила `--omit=dev --ignore-scripts`.
- Версионные метаданные приложения согласованы до `2.1.1` в package/lock, сервере, UI, Docker label, активных отчётах и тестовых ожиданиях.
- Состав и версии зависимостей, базовый Docker image и архитектура контейнеров не изменены.
- Для сервиса `worker` в `compose.yml` отключён унаследованный HTTP-healthcheck образа. `worker` не поднимает HTTP-сервер; его состояние уже контролируется heartbeat в общей БД через readiness и метрики приложения.
- CAD-алгоритмы, бизнес-логика, API-контракты, SQLite, интерфейс и функциональность не изменены. Единственное видимое изменение — номер версии.

## Результаты проверок

| Команда | Результат |
|---|---|
| `npm ci` | PASS — 409 packages |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — Node/API 115/115, frontend 25/25 |
| `npm run build` | PASS |
| `npm run smoke:live` | PASS |
| `npm run test:golden` | PASS — 38/38, отклонение площадей 0 |
| `npm run test:regression` | PASS — 35/35 |
| `npm run test:determinism` | PASS — расхождений 0 |
| `npm run smoke:workflow` | PASS — 12/12 |
| `npm run ci:validate` | PASS — 3 workflows, 33 action references |
| `npm run e2e:chromium` | PASS — 42/42 |
| `npm run prod:local:verify` | PASS — production HTTP 39/39, observability 24/24, app/worker PASS |
| `docker compose build` | BLOCKED — Docker CLI отсутствует, exit 127 |
| `docker compose up -d` | BLOCKED — Docker CLI отсутствует, exit 127 |
| `docker compose ps` / `logs --no-color` | BLOCKED — Docker CLI отсутствует, exit 127 |
| `npm run smoke:production` | FAIL — `ECONNREFUSED 127.0.0.1:8787`, контейнеры не запущены |
| `docker compose down` | BLOCKED — Docker CLI отсутствует, exit 127 |
| повторный `docker compose build` | BLOCKED — Docker CLI отсутствует, exit 127 |

## Коррекция по результатам внешнего Docker Release Gate

На Windows-хосте после сборки и запуска контейнер `worker` выполнял `server/worker.js`, но получал статус `unhealthy`: унаследованный из `Dockerfile` healthcheck обращался к `127.0.0.1:8787/health/live`, тогда как HTTP-сервер запускается только сервисом `app`.

Точечное исправление: для `worker` задано `healthcheck.disable: true`. Проверка работоспособности worker не удалена: приложение продолжает контролировать свежесть `worker_heartbeats` в `/health/ready` и метрике `cad_worker_heartbeat_age_seconds`.

В `scripts/validate-actions.mjs` добавлена статическая защита от возврата дефекта. Повторный Docker Release Gate для исправленного ZIP требуется выполнить на хосте с Docker.

## Предупреждения

- `whatwg-encoding@3.1.1 deprecated` — неблокирующее предупреждение, обновление зависимости вне рамок задачи.
- npm сообщает о внешнем env-параметре `http-proxy`; registry, TLS, proxy и `.npmrc` проектом не изменялись.
- Node предупреждает об experimental SQLite; Vite — о чанке больше 500 kB. Эти предупреждения существующего проекта не вызваны исправлением.

## Итоговый статус

Локальные, baseline, браузерные и production-like проверки прошли. Docker Release Gate не пройден, поскольку в среде отсутствуют Docker CLI, совместимый container engine и Docker socket. По критериям задачи статус — **READY_FOR_DOCKER_ACCEPTANCE**, а не промышленно готовый релиз.

Для окончательного выпуска на Docker-хосте обязательны успешные: `docker compose build`, `docker compose up -d`, `docker compose ps`, проверка логов/healthcheck, `npm run smoke:production`, `docker compose down` и повторный build из чисто распакованного итогового ZIP.
