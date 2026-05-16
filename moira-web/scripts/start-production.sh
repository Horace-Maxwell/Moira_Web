#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}java"
if [[ ! -x "$JAVA_BIN" ]]; then
  JAVA_BIN="$(command -v java)"
fi

PORT_VALUE="${MOIRA_WEB_PORT:-${PORT:-8080}}"
HOST_VALUE="${MOIRA_WEB_HOST:-0.0.0.0}"
STATIC_DIR="${MOIRA_WEB_STATIC_DIR:-$ROOT_DIR/client}"
RESOURCE_DIR="${MOIRA_WEB_RESOURCE_DIR:-$REPO_ROOT}"
JAR_FILE="${MOIRA_WEB_JAR:-$ROOT_DIR/build/moira-web.jar}"

if [[ ! -f "$JAR_FILE" ]]; then
  echo "Missing $JAR_FILE. Run ./scripts/build-server.sh first." >&2
  exit 1
fi

if [[ -n "${JAVA_OPTS:-}" ]]; then
  # shellcheck disable=SC2206
  JAVA_ARGS=($JAVA_OPTS)
else
  JAVA_ARGS=(-Djava.awt.headless=true -XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError)
fi

exec "$JAVA_BIN" "${JAVA_ARGS[@]}" -jar "$JAR_FILE" \
  --host="$HOST_VALUE" \
  --port="$PORT_VALUE" \
  --static-dir="$STATIC_DIR" \
  --resource-dir="$RESOURCE_DIR"
