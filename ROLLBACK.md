# Rollback

Production deployment использует maintenance window, один SQLite writer и immutable image tags. Перед migration обязательны integrity check, consistent backup, hash verification и restore-test на копии.

```bash
bash scripts/rollback-vps.sh
docker compose ps
curl -fsS https://DOMAIN/health/ready
APP_PUBLIC_URL=https://DOMAIN PROFIGYM_ACCESS_TOKEN=... npm run smoke:production
```

Если schema совместима, скрипт возвращает предыдущий image. Если migration необратима, остановите app/worker, восстановите verified backup в отдельный путь, перепроверьте integrity/schema, затем controlled swap database file и запустите предыдущий image. Никогда не восстанавливайте поверх активной БД.

`npm run smoke:rollback` проверяет release markers A/B, backup и возврат к A. Это не доказывает бинарную совместимость двух реально разных images; полный rollback подтверждается только image/VPS smoke.
