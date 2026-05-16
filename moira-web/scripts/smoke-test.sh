#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"

curl --fail --silent "$BASE_URL/health" >/dev/null
curl --fail --silent "$BASE_URL/ready" >/dev/null
curl --fail --silent "$BASE_URL/" >/dev/null
curl --fail --silent "$BASE_URL/api/version" >/dev/null
curl --fail --silent "$BASE_URL/api/runtime/options" >/dev/null
curl --fail --silent "$BASE_URL/api/features" >/dev/null
curl --fail --silent "$BASE_URL/api/chart/preview" >/dev/null
curl --fail --silent \
  --header 'Content-Type: application/json' \
  --data '{"mode":"traditional","name":"DHX","sex":"male","birthDate":"2006-04-10","birthTime":"09:58","nowDate":"2026-04-09","nowTime":"12:30","country":"中国","city":"上海","zone":"Asia/Shanghai","imageWidth":"720","imageHeight":"540"}' \
  "$BASE_URL/api/chart/compute" >/dev/null
curl --fail --silent \
  --header 'Content-Type: application/json' \
  --data '{"name":"DHX","sex":"male","birthDate":"2006-04-10","birthTime":"09:58","country":"中国","city":"上海, 中国","zone":"Asia/Shanghai"}' \
  "$BASE_URL/api/entries/pack" >/dev/null

echo "Smoke test passed for $BASE_URL"
