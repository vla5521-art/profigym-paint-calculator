#!/usr/bin/env bash
set -euo pipefail

: "${PROFIGYM_IMAGE:?immutable image digest reference is required}"
case "$PROFIGYM_IMAGE" in
  ghcr.io/*@sha256:*) ;;
  *) printf '%s\n' 'PROFIGYM_IMAGE must be an immutable ghcr.io/...@sha256:... reference' >&2; exit 2 ;;
esac
test -f .env.production

compose=(docker compose -f compose.yml -f compose.production.yml)
deployment_dir=.deployment
previous_file="$deployment_dir/previous-image"
active_file="$deployment_dir/active-image"
backup_file="$deployment_dir/pre-deploy-backup"
mkdir -p "$deployment_dir"

new_image="$PROFIGYM_IMAGE"
previous="$(test -s "$active_file" && sed -n '1p' "$active_file" || true)"
backup_image="${previous:-$new_image}"

PROFIGYM_IMAGE="$backup_image" "${compose[@]}" pull volume-init app
PROFIGYM_IMAGE="$backup_image" "${compose[@]}" run --rm -T volume-init
PROFIGYM_IMAGE="$backup_image" "${compose[@]}" run --rm -T --no-deps app node scripts/db-integrity.mjs
backup_json="$(PROFIGYM_IMAGE="$backup_image" "${compose[@]}" run --rm -T --no-deps app node scripts/backup-cli.mjs create)"
backup_id="$(printf '%s\n' "$backup_json" | sed -n 's/.*"backupId":[[:space:]]*"\([^"]*\)".*/\1/p' | sed -n '1p')"
test -n "$backup_id"
printf '%s\n' "$backup_id" > "$backup_file"
if [[ -n "$previous" ]]; then printf '%s\n' "$previous" > "$previous_file"; fi

PROFIGYM_IMAGE="$new_image" "${compose[@]}" pull volume-init app worker
"${compose[@]}" stop app worker || true
PROFIGYM_IMAGE="$new_image" "${compose[@]}" run --rm -T volume-init
PROFIGYM_IMAGE="$new_image" "${compose[@]}" run --rm -T --no-deps app node scripts/migrate-db.mjs
PROFIGYM_IMAGE="$new_image" "${compose[@]}" up -d app worker

ready=0
for _ in $(seq 1 60); do
  if PROFIGYM_IMAGE="$new_image" "${compose[@]}" exec -T app node -e \
    "fetch('http://127.0.0.1:8787/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" -ne 1 ]]; then
  printf '%s\n' 'Application did not become ready; rollback is required' >&2
  exit 1
fi

PROFIGYM_IMAGE="$new_image" "${compose[@]}" up -d proxy
printf '%s\n' "$new_image" > "$active_file"
printf '{"image":"%s","previous":"%s","backupId":"%s","deployedAt":"%s"}\n' \
  "$new_image" "$previous" "$backup_id" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$deployment_dir/last-deployment.json"
