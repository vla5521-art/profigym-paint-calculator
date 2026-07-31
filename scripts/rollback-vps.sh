#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f compose.yml -f compose.production.yml)
previous_file=.deployment/previous-image
backup_file=.deployment/pre-deploy-backup
active_file=.deployment/active-image
test -s "$previous_file"
previous="$(sed -n '1p' "$previous_file")"
case "$previous" in
  ghcr.io/*@sha256:*) ;;
  *) printf '%s\n' 'Saved previous image is not an immutable digest reference' >&2; exit 2 ;;
esac

failed_image="${PROFIGYM_IMAGE:-$previous}"
"${compose[@]}" stop app worker || true
if [[ "${ROLLBACK_RESTORE_DATABASE:-true}" == "true" ]]; then
  test -s "$backup_file"
  backup_id="$(sed -n '1p' "$backup_file")"
  PROFIGYM_IMAGE="$failed_image" "${compose[@]}" run --rm -T volume-init
  PROFIGYM_IMAGE="$failed_image" "${compose[@]}" run --rm -T --no-deps app node scripts/backup-cli.mjs restore "$backup_id"
fi

PROFIGYM_IMAGE="$previous" "${compose[@]}" pull volume-init app worker
PROFIGYM_IMAGE="$previous" "${compose[@]}" up -d app worker
ready=0
for _ in $(seq 1 60); do
  if PROFIGYM_IMAGE="$previous" "${compose[@]}" exec -T app node -e \
    "fetch('http://127.0.0.1:8787/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    ready=1
    break
  fi
  sleep 2
done
test "$ready" -eq 1
PROFIGYM_IMAGE="$previous" "${compose[@]}" up -d proxy
printf '%s\n' "$previous" > "$active_file"
printf '{"image":"%s","restoredBackup":"%s","rolledBackAt":"%s"}\n' \
  "$previous" "$(test -s "$backup_file" && sed -n '1p' "$backup_file" || true)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > .deployment/last-rollback.json
