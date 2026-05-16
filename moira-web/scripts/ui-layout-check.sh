#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
PORT_VALUE="${1:-18183}"
BASE_URL="http://127.0.0.1:${PORT_VALUE}"
LOG_FILE="$ROOT_DIR/build/ui-layout-server.log"

if [[ ! -d "$REPO_ROOT/node_modules/playwright" ]]; then
  echo "Playwright dependency is missing. Run npm ci from the repository root." >&2
  exit 2
fi

"$ROOT_DIR/scripts/build-server.sh"

if curl --fail --silent --max-time 1 "$BASE_URL/health" >/dev/null 2>&1; then
  echo "Port $PORT_VALUE already has a Moira Web server. Stop it or choose another port." >&2
  exit 2
fi

MOIRA_WEB_PORT="$PORT_VALUE" \
MOIRA_WEB_HOST="127.0.0.1" \
MOIRA_WEB_STATIC_DIR="$ROOT_DIR/client" \
MOIRA_WEB_RESOURCE_DIR="$REPO_ROOT" \
MOIRA_WEB_STATIC_CACHE=true \
  "$ROOT_DIR/scripts/start-production.sh" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl --fail --silent "$BASE_URL/health" >/dev/null 2>&1; then
    node "$ROOT_DIR/scripts/ui-layout-check.mjs" "$BASE_URL"
    exit 0
  fi
  sleep 0.25
done

echo "Moira Web did not become ready for UI layout check. Recent logs:" >&2
tail -80 "$LOG_FILE" >&2 || true
exit 1
