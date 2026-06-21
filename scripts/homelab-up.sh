#!/usr/bin/env bash
# scripts/homelab-up.sh — bring interior-ai up on homelab-public stack
set -euo pipefail
COMPOSE_FILE="docker-compose.homelab-public.yml"; ENV_FILE=".env.homelab-public"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."
log() { printf '\033[1;34m[homelab-up]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[homelab-up]\033[0m %s\n' "$*" >&2; }

if ! docker network ls --format '{{.Name}}' | grep -q '^homelab-public_web$'; then
  err "Network 'homelab-public_web' not found. Start the homelab first:"
  err "  cd /home/abibinyun/data/homelab-public && docker compose up -d"
  exit 1
fi

require_env() { [ -f "${ENV_FILE}" ] || { err "${ENV_FILE} not found. Run: cp .env.homelab-public.example ${ENV_FILE} && \$EDITOR ${ENV_FILE}"; exit 1; }; }

run_migrate() {
  log "Running Prisma migrations..."
  COMPOSE_PROFILES=homelab-migrate docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" run --rm interior-migrate
}

up() {
  log "Building + starting..."
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" rm -sf interior-migrate 2>/dev/null || true
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build
  log "Waiting for interior-api to become healthy..."
  for i in $(seq 1 30); do
    status=$(docker inspect --format='{{.State.Health.Status}}' interior-api 2>/dev/null || echo "starting")
    [ "${status}" = "healthy" ] && { log "interior-api is healthy."; return 0; }
    sleep 2
  done
  err "interior-api did not become healthy within 60 s."
  exit 1
}

case "${1:-}" in
  -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//' ;;
  --no-migrate) require_env; up; log "Done (no migrate)." ;;
  --migrate) require_env; run_migrate; log "Done." ;;
  --down) require_env; log "Stopping..."; docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" down; log "Done." ;;
  --status) require_env; docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps; docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T interior-api wget -qO- http://localhost:3000/api/health/live 2>/dev/null || err "interior-api not responding" ;;
  ""|--all) require_env; up; run_migrate; log "All up." ;;
  *) err "Unknown: $1. Use --help."; exit 1 ;;
esac
