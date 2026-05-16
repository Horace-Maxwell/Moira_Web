#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
"$ROOT_DIR/scripts/build-server.sh"

JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}java"
if [[ ! -x "$JAVA_BIN" ]]; then
  JAVA_BIN="$(command -v java)"
fi

PORT="${MOIRA_WEB_PORT:-${PORT:-8080}}"
HOST="${MOIRA_WEB_HOST:-0.0.0.0}"
STATIC_DIR="${MOIRA_WEB_STATIC_DIR:-$ROOT_DIR/client}"
RESOURCE_DIR="${MOIRA_WEB_RESOURCE_DIR:-$REPO_ROOT}"

exec "$JAVA_BIN" -jar "$ROOT_DIR/build/moira-web.jar" \
  --host="$HOST" \
  --port="$PORT" \
  --static-dir="$STATIC_DIR" \
  --resource-dir="$RESOURCE_DIR"
