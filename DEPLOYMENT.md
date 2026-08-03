# Deployment — PROFiGYM 2.0.4

## Требования

Linux VPS, Docker Engine 27+ с Compose v2.24.4+, 2 CPU, минимум 4 ГБ RAM и persistent disk. Compose v2.24.4+ нужен для `!override` в production ports/volumes. DNS `A/AAAA` должен указывать на VPS; TLS-файлы находятся только на VPS в `secrets/tls`.

## Первый запуск VPS

```bash
cp .env.production.example .env.production
# заменить URL, origins, image и оба независимых токена
chmod 600 .env.production
mkdir -p secrets/tls
# добавить fullchain.pem и privkey.pem
docker compose -f compose.yml -f compose.production.yml config
docker compose -f compose.yml -f compose.production.yml up -d --build
docker compose -f compose.yml -f compose.production.yml ps
```

`volume-init` однократно назначает named volumes пользователю UID/GID 1000. `app` и `worker` используют один image, но разные команды, read-only root filesystem и `USER node`.

Production image запускает API, worker, healthcheck и служебные скрипты напрямую через `node`. Глобальные `npm`, `npx`, `corepack` и `yarn` намеренно отсутствуют в runtime; команды сборки и управления через npm выполняются с хоста или в build/dependencies стадиях.

## GitHub Environments и secrets

Создайте Environments `staging` и `production`; для `production` включите required reviewer. Repository/organization secrets:

- `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`;
- `DEPLOY_KNOWN_HOSTS` — заранее проверенная строка known_hosts, не результат доверия `ssh-keyscan` во время deploy;
- `DEPLOY_PATH`, `DEPLOY_URL` (только HTTPS);
- `PROFIGYM_ACCESS_TOKEN`, `PROFIGYM_METRICS_TOKEN`.

Если secrets отсутствуют, ручной deploy получает контролируемый skip. Обычный push никогда не запускает deploy.

## Публикация image и deploy

1. Загрузите проект в GitHub и дождитесь зелёных `quality` и `container`.
2. Скачайте `stage7-container-evidence` и возьмите digest из `image-digest.txt`.
3. Откройте Actions → deploy → Run workflow.
4. Выберите `staging`, вставьте `sha256:...` и выполните smoke.
5. Повторите для `production`; reviewer подтверждает GitHub Environment.

Deploy использует `ghcr.io/<owner>/profigym-calculator@sha256:...`. Для private GHCR VPS должен быть предварительно авторизован read-only token; для public package login не нужен.

## Backup, readiness и rollback

`scripts/deploy-vps.sh` выполняет: pull текущего backup image → volume init → integrity → backup и фиксацию backup ID → stop app/worker → pull нового digest → migration → app/worker readiness → proxy → запись active digest.

Если deploy или внешний HTTP smoke падает, workflow вызывает `scripts/rollback-vps.sh`: app/worker останавливаются, pre-deploy backup повторно проверяется и атомарно восстанавливается, затем запускается предыдущий digest и проверяется readiness. Safety-copy заменённой БД остаётся рядом с основной БД.

## Smoke

```bash
APP_PUBLIC_URL=https://REAL_DOMAIN \
PROFIGYM_ACCESS_TOKEN=... \
PROFIGYM_METRICS_TOKEN=... \
npm run smoke:production
```

Smoke работает только через HTTP и проверяет liveness/readiness/auth/security headers, реальный `through_hole.step`, очередь/worker, площадь, mesh, JSON/HTML reports, CAD→ЛКМ, удаление, HTTP 415 и повреждённый STEP.

Без фактического VPS-запуска статус остаётся `CI_FIXED_READY_FOR_GITHUB` или `CI_FIXED_DOCKER_VERIFIED`, но не `PRODUCTION_DEPLOYED`.
