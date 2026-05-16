#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT_VALUE="${MOIRA_WEB_PORT:-8080}"
BASE_URL="http://127.0.0.1:${PORT_VALUE}"
VERIFY_URL="${MOIRA_WEB_VERIFY_URL:-$BASE_URL}"
WAIT_SECONDS="${MOIRA_WEB_WAIT_SECONDS:-120}"
POLL_SECONDS="${MOIRA_WEB_POLL_SECONDS:-2}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker, then rerun this script." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required. Install curl, then rerun this script." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but the daemon is not reachable." >&2
  echo "Start Docker Desktop, Colima, or your server Docker service, then rerun this script." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Docker Compose is required. Install Docker Compose v2 or docker-compose, then rerun this script." >&2
  exit 1
fi

cd "$ROOT_DIR"
"${COMPOSE[@]}" up -d --build

echo "Waiting for Moira Web at ${BASE_URL} ..."
elapsed=0
while (( elapsed <= WAIT_SECONDS )); do
  if curl --fail --silent "${BASE_URL}/health" >/dev/null \
      && curl --fail --silent "${BASE_URL}/ready" >/dev/null; then
    "$ROOT_DIR/scripts/verify-deployment.sh" "$VERIFY_URL"
    echo "Moira Web is ready: ${VERIFY_URL}"
    exit 0
  fi
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done

echo "Moira Web did not become ready in time. Recent logs:" >&2
"${COMPOSE[@]}" logs --tail=80 moira-web >&2
exit 1
