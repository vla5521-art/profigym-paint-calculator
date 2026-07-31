# Backup and restore

`backup:create` выполняет WAL checkpoint и consistent SQLite `VACUUM INTO`, затем записывает manifest: backup ID, timestamp, app/schema version, size и SHA-256. `backup:verify` проверяет hash, integrity и schema; `backup:restore:test` всегда копирует БД во временный каталог.

```bash
npm run backup:create
npm run backup:list
npm run backup:verify
npm run backup:restore:test
npm run backup:cleanup
```

STEP/mesh/previews/reports не включаются в DB backup. Для disaster recovery снимайте соответствующие named volumes отдельно после согласованного checkpoint/maintenance window и храните их с тем же backup ID. Шифрование и off-site replication выполняются инфраструктурой владельца.

Production restore: остановить proxy/app/worker, проверить backup, выполнить restore-test, сохранить повреждённую БД отдельно, скопировать backup в новый файл, запустить migrations, integrity/readiness/smoke, затем вернуть трафик.
