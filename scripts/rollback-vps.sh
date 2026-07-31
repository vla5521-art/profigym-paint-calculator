#!/usr/bin/env bash
set -euo pipefail
previous_file=.deployment/previous-image
test -s "$previous_file"
previous="$(cat "$previous_file")"
export PROFIGYM_IMAGE="$previous"
docker compose -f compose.yml pull app worker
docker compose -f compose.yml up -d app worker
for _ in $(seq 1 60); do docker compose -f compose.yml exec -T app node -e "fetch('http://127.0.0.1:8787/health/ready').then(r=>process.exit(r.ok?0:1))" && break; sleep 2; done
printf '%s\n' "$previous" > .deployment/active-image
