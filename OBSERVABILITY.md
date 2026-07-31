# Observability

Production logs — JSON с `timestamp`, `level`, `service`, `environment`, `applicationVersion`, request/correlation/job/calculation/worker IDs, event, duration/status/error fields. Authorization, cookies, token/password/secret и stack редактируются; stack доступен только internal error log в redacted виде.

`GET /metrics` защищён metrics bearer token. Labels не содержат filenames, calculation/job/request/correlation IDs. `observability/alerts.yml` содержит примеры правил; реальные notifications не заявлены без подключённого Alertmanager. Dashboard `observability/grafana/profigym-dashboard.json` provisioned автоматически.

```bash
PROFIGYM_METRICS_TOKEN=... curl -H "Authorization: Bearer $PROFIGYM_METRICS_TOKEN" https://DOMAIN/metrics
npm run smoke:observability
docker compose --profile observability up -d
```

Readiness проверяет SQLite/schema, writable storage, queue, production assets и свежий worker heartbeat. Liveness не делает тяжёлых операций. Startup проверяет конфигурацию, каталоги, schema и assets; полноценный STEP при health request не запускается.
