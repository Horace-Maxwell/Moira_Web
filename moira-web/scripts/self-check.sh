#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT_VALUE="${1:-18080}"
BASE_URL="http://127.0.0.1:$PORT_VALUE"
LOG_FILE="$ROOT_DIR/build/self-check-server.log"
HEADER_FILE="$ROOT_DIR/build/self-check-headers.txt"
BODY_FILE="$ROOT_DIR/build/self-check-body.bin"

"$ROOT_DIR/scripts/build-server.sh"

MOIRA_WEB_PORT="$PORT_VALUE" \
MOIRA_WEB_HOST="127.0.0.1" \
MOIRA_WEB_STATIC_DIR="$ROOT_DIR/client" \
MOIRA_WEB_RESOURCE_DIR="$(cd "$ROOT_DIR/.." && pwd)" \
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

for _ in $(seq 1 40); do
  if curl --fail --silent "$BASE_URL/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

curl --fail --silent "$BASE_URL/health" | grep -q '"status":"ok"'
grep -q '"event":"server_started"' "$LOG_FILE"
if grep -q 'Exception\|StackOverflowError' "$LOG_FILE"; then
  cat "$LOG_FILE" >&2
  exit 1
fi
"$ROOT_DIR/scripts/smoke-test.sh" "$BASE_URL"
curl --fail --silent "$BASE_URL/" | grep -q '七政四餘星盤 - Moira'
curl --fail --silent "$BASE_URL/api/features" | grep -q '七政四余星盘'
curl --fail --silent "$BASE_URL/api/runtime/options" | grep -q 'Asia/Shanghai'
curl --fail --silent "$BASE_URL/ready" | grep -q '"resourceReady":true'
PACKED_ENTRY="$(curl --fail --silent \
  --header 'Content-Type: application/json' \
  --data '{"name":"DHX","sex":"male","birthDate":"2006-04-10","birthTime":"09:58","country":"中国","city":"上海, 中国","zone":"Asia/Shanghai"}' \
  "$BASE_URL/api/entries/pack" | ruby -rjson -e 'print JSON.parse(STDIN.read)["packedEntry"]')"
PACKED_ENTRY_B64="$(printf '%s' "$PACKED_ENTRY" | ruby -rbase64 -e 'print Base64.strict_encode64(STDIN.read)')"
MRI_B64="$(PACKED_ENTRY_B64="$PACKED_ENTRY_B64" ruby -rjson -e 'print JSON.generate({dataEntries: ENV.fetch("PACKED_ENTRY_B64"), pickEntries: "", footer: "self-check", fileName: "self-check.mri"})' \
  | curl --fail --silent --header 'Content-Type: application/json' --data @- "$BASE_URL/api/datasets/export" \
  | ruby -rjson -e 'print JSON.parse(STDIN.read)["mriBase64"]')"
MRI_B64="$MRI_B64" ruby -rjson -e 'print JSON.generate({mriBase64: ENV.fetch("MRI_B64")})' \
  | curl --fail --silent --header 'Content-Type: application/json' --data @- "$BASE_URL/api/datasets/import" \
  | grep -q '"status":"imported"'
for mode in traditional pick western sidereal; do
  curl --fail --silent \
    --header 'Content-Type: application/json' \
    --data "{\"mode\":\"$mode\",\"name\":\"DHX\",\"sex\":\"male\",\"birthDate\":\"2006-04-10\",\"birthTime\":\"09:58\",\"nowDate\":\"2026-04-09\",\"nowTime\":\"12:30\",\"country\":\"中国\",\"city\":\"上海\",\"zone\":\"Asia/Shanghai\",\"imageWidth\":\"720\",\"imageHeight\":\"540\"}" \
    "$BASE_URL/api/chart/compute" | grep -q 'chartPngBase64'
done

curl --fail --silent \
  --dump-header "$HEADER_FILE" \
  --output "$BODY_FILE" \
  --header 'Accept-Encoding: gzip' \
  "$BASE_URL/styles.css"
grep -qi '^Content-encoding: gzip' "$HEADER_FILE"
grep -qi '^Etag:' "$HEADER_FILE"
grep -qi '^Cache-control: public' "$HEADER_FILE"

echo "Self-check passed for $BASE_URL"
