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
CSS_FILE="$TMP_DIR/styles.css"

curl --fail --silent "$BASE_URL/" > "$HTML_FILE"
grep -q '七政四餘星盤 - Moira' "$HTML_FILE"
grep -q 'class="menubar"' "$HTML_FILE"
grep -q '檔案(&F)' "$HTML_FILE"
grep -q '編輯(&E)' "$HTML_FILE"
grep -q '選項(&P)' "$HTML_FILE"
grep -q '搜索(&S)' "$HTML_FILE"
grep -q '檢視(&V)' "$HTML_FILE"
grep -q '說明(&H)' "$HTML_FILE"
grep -q '選擇星盤(&M)...' "$HTML_FILE"
grep -q '顯示流年(&N)' "$HTML_FILE"
grep -q '顯示三垣列宿' "$HTML_FILE"
grep -q '顯示開禧宿度(&N)' "$HTML_FILE"
grep -q '顯示高格林(&N)' "$HTML_FILE"
grep -q '顯示單圈(&N)' "$HTML_FILE"
grep -q '顯示地平方位' "$HTML_FILE"
grep -q '顯示相位(&A)' "$HTML_FILE"
grep -q '顯示神煞註釋(&E)' "$HTML_FILE"
grep -q '項目顯示' "$HTML_FILE"
grep -q '工具列顯示' "$HTML_FILE"
grep -q '選擇星曜(&I)...' "$HTML_FILE"
grep -q '選擇星曜及強勢角距(&J)...' "$HTML_FILE"
grep -q '選擇相位(&K)...' "$HTML_FILE"
grep -q '選擇角距顯示(&O)...' "$HTML_FILE"
grep -q '選擇分宮制(&H)...' "$HTML_FILE"
grep -q '選擇回歸恆星制(&S)...' "$HTML_FILE"
grep -q '選擇合盤計算(&U)...' "$HTML_FILE"
grep -q '選擇神煞(&S)...' "$HTML_FILE"
grep -q '選擇政餘格局(&Z)...' "$HTML_FILE"
grep -q '選擇擇日計算(&H)...' "$HTML_FILE"
grep -q '字形方向設定(&V)...' "$HTML_FILE"
grep -q '色彩設定(&C)...' "$HTML_FILE"
grep -q 'class="menu-cascade"' "$HTML_FILE"
grep -q '流年星法(&T)...' "$HTML_FILE"
grep -q '現在時間(&N)' "$HTML_FILE"
grep -q '操作說明(&O)' "$HTML_FILE"
grep -q 'name="mode" type="hidden"' "$HTML_FILE"
grep -q 'app-ui-native-71' "$HTML_FILE"
if grep -q 'class="titlebar"' "$HTML_FILE"; then
  echo "Unexpected legacy fake titlebar found in HTML." >&2
  exit 1
fi

curl --fail --silent "$BASE_URL/styles.css" > "$CSS_FILE"
grep -q -- '--control-panel-width: clamp(300px, 24vw, 500px);' "$CSS_FILE"
grep -q 'padding-right: 0;' "$CSS_FILE"
grep -q 'object-position: left top;' "$CSS_FILE"
grep -q 'grid-template-columns: minmax(0, 1fr) 88px;' "$CSS_FILE"
grep -q '.menu-cascade > summary::after' "$CSS_FILE"
grep -q '.menu-subpanel' "$CSS_FILE"
grep -q 'position: fixed;' "$CSS_FILE"
grep -q 'z-index: 80;' "$CSS_FILE"

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
grep -qi '^Cache-control: public' "$HEADERS_FILE"

echo "Deployment verified: $BASE_URL"
