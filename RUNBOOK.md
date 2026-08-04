# Production runbook

Все команды выполняются из release directory.

## Состояние и логи

```bash
npm run prod:status
npm run prod:logs
curl -fsS https://DOMAIN/health/live
curl -fsS https://DOMAIN/health/ready
curl -fsS https://DOMAIN/health/startup
```

## Проверка пользовательского рабочего процесса

После релиза авторизуйтесь, загрузите контрольный STEP и дождитесь завершения расчёта. На новом результате и после повторного открытия сохранённого расчёта должны быть видны две основные площади; диагностика и ручные решения должны открываться через «Подробнее». Ошибки, предупреждения и индикатор `review_required` должны оставаться видимыми при закрытом блоке.

Передайте окрашиваемую площадь в калькулятор ЛКМ, вручную задайте положительную норму расхода и коэффициент потерь, затем проверьте итоговый расход. Завершите проверку скачиванием отчёта и повторным открытием расчёта.

## Очередь и correlation ID

```bash
docker compose exec -T app node --input-type=module -e "import {migrateDatabase} from './server/cad/calculations/migrations.js';import {cadConfig} from './server/config.js';const d=migrateDatabase(cadConfig.databasePath);console.log(d.prepare('select job_id,status,attempt,worker_id,correlation_id,heartbeat_at from cad_jobs order by created_at desc limit 50').all());d.close()"
docker compose logs worker | grep CORRELATION_ID
```

Stale jobs восстанавливаются автоматически. Для controlled requeue остановите worker, проверьте heartbeat/attempt, затем обновляйте только конкретный job через SQLite transaction; не сбрасывайте всю таблицу.

## Worker restart и растущая очередь

```bash
docker compose restart worker
docker compose logs --tail=200 worker
curl -fsS -H "Authorization: Bearer $PROFIGYM_METRICS_TOKEN" https://DOMAIN/metrics | grep cad_jobs
```

Проверьте memory, timeout, invalid STEP и disk. Увеличивайте concurrency только после benchmark; default `1`.

## Storage, SQLite, backup

```bash
npm run storage:cleanup:dry-run
npm run storage:cleanup
npm run db:integrity
npm run db:checkpoint
npm run backup:create
npm run backup:verify
npm run backup:restore:test
```

При заполнении диска сначала dry-run cleanup, затем проверьте backups и volume usage. Не удаляйте active source/mesh вручную.

## Token/TLS rotation

Обновите secret в `.env.production`, затем `docker compose up -d --force-recreate app`; прежние sessions станут недействительными. Для TLS атомарно замените cert/key с mode 600, выполните `nginx -t` в proxy и `docker compose exec proxy nginx -s reload`.

## 5xx / high memory

Найдите request ID, свяжите с worker correlation ID, проверьте queue/heartbeat, SQLite integrity, disk и container limits. Stack trace остаётся только в redacted internal logs. При подтверждённой regression используйте [ROLLBACK.md](ROLLBACK.md).
