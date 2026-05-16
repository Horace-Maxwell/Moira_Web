#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:${MOIRA_WEB_PORT:-8080}}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

curl --fail --silent "$BASE_URL/health" >/dev/null
curl --fail --silent "$BASE_URL/ready" >/dev/null
HTML_FILE="$TMP_DIR/index.html"
VERSION_FILE="$TMP_DIR/version.json"
FEATURES_FILE="$TMP_DIR/features.json"
HEADERS_FILE="$TMP_DIR/static.headers"

curl --fail --silent "$BASE_URL/" > "$HTML_FILE"
grep -q '七政四餘星盤 - Moira' "$HTML_FILE"
grep -q 'class="menubar"' "$HTML_FILE"
grep -q '档案 (F)' "$HTML_FILE"
grep -q '编辑 (E)' "$HTML_FILE"
grep -q '选项 (P)' "$HTML_FILE"
grep -q '搜索 (S)' "$HTML_FILE"
grep -q '检视 (V)' "$HTML_FILE"
grep -q '说明 (H)' "$HTML_FILE"
grep -q 'name="mode" form="chartForm"' "$HTML_FILE"
grep -q 'app-ui-native-' "$HTML_FILE"
if grep -q 'class="titlebar"' "$HTML_FILE"; then
  echo "Unexpected legacy fake titlebar found in HTML." >&2
  exit 1
fi

curl --fail --silent "$BASE_URL/api/version" > "$VERSION_FILE"
ruby -rjson -e '
  data = JSON.parse(File.read(ARGV.fetch(0)))
  font = data["fontName"].to_s
  if font.empty? || font =~ /^(Dialog|SansSerif)$/i
    warn "Unexpected runtime fontName: #{font.inspect}"
    exit 1
  end
' "$VERSION_FILE"

curl --fail --silent "$BASE_URL/api/runtime/options" | grep -q 'Asia/Shanghai'
curl --fail --silent "$BASE_URL/api/features" > "$FEATURES_FILE"
ruby -rjson -e '
  data = JSON.parse(File.read(ARGV.fetch(0)))
  modes = Array(data["desktopModes"]).map { |item| item["id"] }
  missing = %w[traditional pick western sidereal] - modes
  unless missing.empty?
    warn "Missing desktop modes: #{missing.join(", ")}"
    exit 1
  end
' "$FEATURES_FILE"

for mode in traditional pick western sidereal; do
  curl --fail --silent \
    --header 'Content-Type: application/json' \
    --data "{\"mode\":\"$mode\",\"name\":\"DHX\",\"sex\":\"male\",\"birthDate\":\"2006-04-10\",\"birthTime\":\"09:58\",\"nowDate\":\"2026-05-15\",\"nowTime\":\"22:05\",\"country\":\"中国\",\"city\":\"北京\",\"zone\":\"Asia/Shanghai\",\"imageWidth\":\"1280\",\"imageHeight\":\"800\"}" \
    "$BASE_URL/api/chart/compute" | ruby -rjson -e '
      data = JSON.parse(STDIN.read)
      unless data["chartPngBase64"].to_s.length > 1000
        warn "Chart PNG payload is missing or too small"
        exit 1
      end
      pages = data["textPages"] || {}
      unless pages["calculation"].to_s.length > 100 && pages["eightCharacters"].to_s.length > 20
        warn "Text pages are missing expected calculation output"
        exit 1
      end
    '
done

curl --fail --silent \
  --dump-header "$HEADERS_FILE" \
  --output /dev/null \
  --header 'Accept-Encoding: gzip' \
  "$BASE_URL/styles.css"
grep -qi '^Content-encoding: gzip' "$HEADERS_FILE"
grep -qi '^Etag:' "$HEADERS_FILE"

echo "Deployment verified: $BASE_URL"
