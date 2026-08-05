# PROFiGYM — калькулятор расхода краски v2.1.1

Версия 2.1.1 повышает надёжность установки npm-зависимостей при Docker-сборке в условиях кратковременных сетевых разрывов. Функциональность версии 2.1.0 сохранена: для нового и сохранённого расчёта сразу видны полная и окрашиваемая площади; диагностика, формула, контакты, технологические элементы, правила и ручные решения доступны через закрытый по умолчанию блок «Подробнее». Ошибки, предупреждения и количество объектов `review_required` остаются видимыми. STEP-only CAD pipeline, OCCT/WASM, геометрические эталоны и версии алгоритмов `geometry 2.0 / contact 3.0 / feature 4.0` сохранены без изменений.

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

## Основной рабочий процесс

1. Загрузите STEP и дождитесь завершения CAD-расчёта.
2. Проверьте полную и окрашиваемую площади. При наличии предупреждения или `review_required` откройте «Подробнее» и примите ручные решения.
3. Сохраните расчёт либо откройте ранее сохранённый результат; обе страницы используют одинаковую структуру площадей и блока «Подробнее».
4. Передайте окрашиваемую площадь в калькулятор ЛКМ, вручную введите норму расхода и коэффициент потерь, затем выполните расчёт.

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
npm run smoke:live
npm run smoke:workflow
npm run e2e:chromium
npm run e2e:a11y
npm run security:audit
npm run security:sbom
npm run security:licenses
npm run security:secrets
npm run prod:local:verify
npm run smoke:production
```

Версии и официальные источники GitHub Actions зафиксированы в [CI_ACTIONS.md](CI_ACTIONS.md). Container workflow проверяет, что финальный image содержит Node, но не содержит глобальные npm/corepack/yarn, затем использует Trivy `v0.36.0` в последовательности `table → SARIF → validation → upload → enforce`, явно загружает pushed image обратно в runner перед scan/smoke и сохраняет digest/SARIF. Deploy запускается только вручную по immutable digest; отсутствие VPS secrets даёт контролируемый skip, а не красный workflow на обычном push.

`prod:local:verify` поднимает app и worker как отдельные production-процессы, проверяет реальный HTTP workflow, остановку/restart worker, observability, backup/restore и rollback marker. Docker image/Compose считаются проверенными только после фактического запуска Docker.

## Статус публикации

Локальный итоговый статус исправления — `CI_FIXED_READY_FOR_GITHUB` или `CI_FIXED_DOCKER_VERIFIED`. Статус `PRODUCTION_DEPLOYED` не используется без фактического VPS-деплоя.
