#!/usr/bin/env bash
set -euo pipefail
: "${PROFIGYM_IMAGE:?immutable image tag is required}"
test -f .env.production
previous_file=.deployment/previous-image
active_file=.deployment/active-image
mkdir -p .deployment
previous="$(test -f "$active_file" && cat "$active_file" || true)"
docker compose -f compose.yml run --rm app node scripts/db-integrity.mjs
docker compose -f compose.yml run --rm app node server/backup-cli.js
docker compose -f compose.yml pull app worker
docker compose -f compose.yml run --rm app node scripts/migrate-db.mjs
docker compose -f compose.yml up -d app worker
for _ in $(seq 1 60); do docker compose -f compose.yml exec -T app node -e "fetch('http://127.0.0.1:8787/health/ready').then(r=>process.exit(r.ok?0:1))" && break; sleep 2; done
docker compose -f compose.yml up -d proxy
if [[ -n "$previous" ]]; then printf '%s\n' "$previous" > "$previous_file"; fi
printf '%s\n' "$PROFIGYM_IMAGE" > "$active_file"
