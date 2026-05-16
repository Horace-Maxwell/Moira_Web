#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${1:-${MOIRA_WEB_VERIFY_URL:-http://127.0.0.1:${MOIRA_WEB_PORT:-8080}}}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required for browser UI layout verification." >&2
  echo "Install Node.js 22+, then rerun this script." >&2
  exit 2
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required for browser UI layout verification." >&2
  exit 2
fi

cd "$ROOT_DIR"

if [[ ! -d "$ROOT_DIR/node_modules/playwright" ]]; then
  echo "Installing browser test dependencies with npm ci..."
  npm ci
fi

if [[ "${MOIRA_WEB_SKIP_PLAYWRIGHT_INSTALL:-false}" != "true" ]]; then
  echo "Ensuring Chromium is installed for Playwright..."
  if ! npx playwright install chromium; then
    echo "Could not install Chromium automatically." >&2
    echo "On Linux servers, try: npx playwright install --with-deps chromium" >&2
    exit 2
  fi
fi

node "$ROOT_DIR/moira-web/scripts/ui-layout-check.mjs" "$BASE_URL"
