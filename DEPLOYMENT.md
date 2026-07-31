# Deployment

## Требования

Linux VPS, Docker Engine 27+ с Compose v2, 2 CPU, минимум 4 ГБ RAM и persistent disk. DNS `A/AAAA` указывает на VPS. Для IDN используйте Punycode в DNS/TLS-конфигурации. Serverless Vercel не подходит для SQLite, локального storage, persistent worker и длительного OCCT.

## Первый запуск

```bash
cp .env.production.example .env.production
openssl rand -base64 48
chmod 600 .env.production
mkdir -p secrets/tls
# поместить реальные fullchain.pem и privkey.pem; chmod 600 secrets/tls/privkey.pem
docker compose -f compose.yml -f compose.production.yml config
docker compose -f compose.yml -f compose.production.yml up -d --build
docker compose -f compose.yml -f compose.production.yml ps
APP_PUBLIC_URL=https://REAL_DOMAIN PROFIGYM_ACCESS_TOKEN=... PROFIGYM_METRICS_TOKEN=... npm run smoke:production
```

Замените `APP_PUBLIC_URL`, `APP_ALLOWED_ORIGINS`, `TLS_DOMAIN`, `PROFIGYM_IMAGE`, оба токена. Не используйте example.invalid. Для Prometheus запишите metrics token без перевода строки в `secrets/metrics_token` и включите `--profile observability`. ClamAV включается `--profile antivirus`; production recommendation — `CAD_ANTIVIRUS_FAIL_MODE=closed` после EICAR-проверки.

## Обновление

`scripts/deploy-vps.sh` выполняет integrity → backup → pull immutable image → migration → readiness → proxy. Это controlled maintenance deployment: одна активная версия пишет в SQLite. Для несовместимой миграции предусмотрен verified backup и downtime; безопасный параллельный blue/green writer не заявляется.

## Публикация

Минимальные действия владельца: создать GitHub repository, GHCR permissions и Environments; добавить `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`, `DEPLOY_URL`, `PROFIGYM_ACCESS_TOKEN`; настроить production required reviewer; подготовить VPS/DNS/TLS; запустить container workflow и staging deploy; проверить smoke; подтвердить production environment.
