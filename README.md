# PROFiGYM — калькулятор расхода краски v2.0.4

Версия 2.0.4 устраняет пять исправляемых HIGH/CRITICAL CVE, находившихся не в зависимостях приложения, а во встроенном глобальном npm официального Node image. Production runtime запускает приложение и healthcheck напрямую через `node`, поэтому глобальные npm/corepack/yarn удалены только из финальной стадии; build/dependencies stages сохраняют npm и воспроизводимые `npm ci`. Container workflow проверяет npm-free runtime до неизменённой блокирующей последовательности Trivy. Используется актуальный patch-tag `node:24.18.1-bookworm-slim`. STEP-only CAD pipeline, OCCT/WASM, геометрические эталоны и версии алгоритмов `geometry 2.0 / contact 3.0 / feature 4.0` сохранены без изменений.

## Архитектура

```text
HTTPS reverse proxy
  → app: frontend, API, auth, rate limits, reports, health, metrics
  → SQLite durable queue
  → worker: STEP → OCCT → contacts → features → viewer mesh
  → /data persistent volumes: database/source-files/viewer-mesh/previews/reports/backups
```

Один active deployment использует одну общую SQLite. Независимые replica с отдельными локальными БД не поддерживаются. Для горизонтального масштабирования нужны внешняя БД и object storage.

## Поддерживаемые форматы

Только `.stp` и `.step`. Другие форматы, включая `.sldprt`/`.sldasm`/`.asm`, получают HTTP 415.

## Разработка

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev:full
```

В development используется inline worker для обратной совместимости тестов. Production всегда задаёт `CAD_PROCESSING_MODE=queue` и запускает `server/worker.js` отдельным процессом.

## Production-like Compose

```bash
cp .env.production.example .env.production
# заменить URL, домен, image и токены; chmod 600 .env.production
docker compose -f compose.yml -f compose.production.yml config
docker compose -f compose.yml -f compose.production.yml up -d --build
npm run smoke:production
```

Подробности: [DEPLOYMENT.md](DEPLOYMENT.md), [RUNBOOK.md](RUNBOOK.md), [ROLLBACK.md](ROLLBACK.md), [BACKUP_RESTORE.md](BACKUP_RESTORE.md), [SECURITY_PRODUCTION.md](SECURITY_PRODUCTION.md), [OBSERVABILITY.md](OBSERVABILITY.md).

## Проверка

```bash
npm run ci:validate
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run test:regression
npm run test:determinism
npm run test:security
npm run build
npm run verify:template
npm run e2e:chromium
npm run e2e:a11y
npm run security:audit
npm run security:sbom
npm run security:licenses
npm run security:secrets
npm run prod:local:verify
```

Версии и официальные источники GitHub Actions зафиксированы в [CI_ACTIONS.md](CI_ACTIONS.md). Container workflow проверяет, что финальный image содержит Node, но не содержит глобальные npm/corepack/yarn, затем использует Trivy `v0.36.0` в последовательности `table → SARIF → validation → upload → enforce`, явно загружает pushed image обратно в runner перед scan/smoke и сохраняет digest/SARIF. Deploy запускается только вручную по immutable digest; отсутствие VPS secrets даёт контролируемый skip, а не красный workflow на обычном push.

`prod:local:verify` поднимает app и worker как отдельные production-процессы, проверяет реальный HTTP workflow, остановку/restart worker, observability, backup/restore и rollback marker. Docker image/Compose считаются проверенными только после фактического запуска Docker.

## Excel-шаблон

Файл `public/templates/PROFiGYM_шаблон_импорта.xlsx` сохраняется с точным Unicode-именем. `npm run build` и `npm run verify:template` проверяют валидность XLSX, UTF-8 имя, отсутствие `PROFiGYM_#U*.xlsx` и совпадение SHA-256 с `dist`.

## Статус публикации

Локальный итоговый статус исправления — `CI_FIXED_READY_FOR_GITHUB` или `CI_FIXED_DOCKER_VERIFIED`. Статус `PRODUCTION_DEPLOYED` не используется без фактического VPS-деплоя.
