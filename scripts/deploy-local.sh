#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT_VALUE="${MOIRA_WEB_PORT:-8080}"
BASE_URL="http://127.0.0.1:${PORT_VALUE}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker, then rerun this script." >&2
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
for _ in $(seq 1 60); do
  if curl --fail --silent "${BASE_URL}/health" >/dev/null \
      && curl --fail --silent "${BASE_URL}/ready" >/dev/null; then
    echo "Moira Web is ready: ${BASE_URL}"
    exit 0
  fi
  sleep 2
done

echo "Moira Web did not become ready in time. Recent logs:" >&2
"${COMPOSE[@]}" logs --tail=80 moira-web >&2
exit 1
