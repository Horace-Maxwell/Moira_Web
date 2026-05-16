#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:${MOIRA_WEB_PORT:-8080}}"

curl --fail --silent "$BASE_URL/health" >/dev/null
curl --fail --silent "$BASE_URL/ready" >/dev/null
curl --fail --silent "$BASE_URL/" | grep -q '七政四餘星盤'
curl --fail --silent "$BASE_URL/api/runtime/options" | grep -q 'Asia/Shanghai'
curl --fail --silent \
  --header 'Content-Type: application/json' \
  --data '{"mode":"traditional","name":"DHX","sex":"male","birthDate":"2006-04-10","birthTime":"09:58","nowDate":"2026-05-15","nowTime":"22:05","country":"中国","city":"北京","zone":"Asia/Shanghai","imageWidth":"1280","imageHeight":"800"}' \
  "$BASE_URL/api/chart/compute" | grep -q 'chartPngBase64'

echo "Deployment verified: $BASE_URL"
