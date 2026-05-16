#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SPEC_FILE="${ROOT_DIR}/moira-web/.do/app.yaml"
API_ROOT="${DIGITALOCEAN_API_ROOT:-https://api.digitalocean.com/v2}"

if [[ -z "${DIGITALOCEAN_TOKEN:-}" ]]; then
  echo "DIGITALOCEAN_TOKEN is required." >&2
  echo "Create or rotate a DigitalOcean API token, then run:" >&2
  echo "  export DIGITALOCEAN_TOKEN=..." >&2
  echo "  ./moira-web/scripts/deploy-digitalocean.sh" >&2
  exit 2
fi

if [[ ! -f "${SPEC_FILE}" ]]; then
  echo "App spec not found: ${SPEC_FILE}" >&2
  exit 2
fi

tmp_spec="$(mktemp)"
tmp_response="$(mktemp)"
trap 'rm -f "${tmp_spec}" "${tmp_response}"' EXIT

ruby -ryaml -rjson -e 'puts JSON.generate({spec: YAML.load_file(ARGV.fetch(0))})' "${SPEC_FILE}" > "${tmp_spec}"

echo "Checking DigitalOcean credentials..."
account_status="$(curl -sS -o "${tmp_response}" -w "%{http_code}" \
  -H "Authorization: Bearer ${DIGITALOCEAN_TOKEN}" \
  -H "Content-Type: application/json" \
  "${API_ROOT}/account")"

if [[ "${account_status}" != "200" ]]; then
  echo "DigitalOcean authentication failed with HTTP ${account_status}." >&2
  cat "${tmp_response}" >&2
  exit 1
fi

if [[ -n "${DIGITALOCEAN_APP_ID:-}" ]]; then
  echo "Updating DigitalOcean App Platform app ${DIGITALOCEAN_APP_ID}..."
  app_status="$(curl -sS -X PUT -o "${tmp_response}" -w "%{http_code}" \
    -H "Authorization: Bearer ${DIGITALOCEAN_TOKEN}" \
    -H "Content-Type: application/json" \
    --data-binary "@${tmp_spec}" \
    "${API_ROOT}/apps/${DIGITALOCEAN_APP_ID}")"
else
  echo "Creating DigitalOcean App Platform app from ${SPEC_FILE}..."
  app_status="$(curl -sS -X POST -o "${tmp_response}" -w "%{http_code}" \
    -H "Authorization: Bearer ${DIGITALOCEAN_TOKEN}" \
    -H "Content-Type: application/json" \
    --data-binary "@${tmp_spec}" \
    "${API_ROOT}/apps")"
fi

if [[ "${app_status}" != "200" && "${app_status}" != "201" ]]; then
  echo "DigitalOcean app request failed with HTTP ${app_status}." >&2
  cat "${tmp_response}" >&2
  exit 1
fi

app_id="$(ruby -rjson -e 'data = JSON.parse(File.read(ARGV.fetch(0))); puts data.dig("app", "id").to_s' "${tmp_response}")"
live_url="$(ruby -rjson -e 'data = JSON.parse(File.read(ARGV.fetch(0))); puts(data.dig("app", "live_url") || data.dig("app", "default_ingress") || "")' "${tmp_response}")"

if [[ -z "${app_id}" ]]; then
  echo "DigitalOcean response did not include an app id." >&2
  cat "${tmp_response}" >&2
  exit 1
fi

echo "App id: ${app_id}"
if [[ -n "${live_url}" ]]; then
  echo "Live URL: ${live_url}"
fi

echo "Recent deployments:"
curl -sS \
  -H "Authorization: Bearer ${DIGITALOCEAN_TOKEN}" \
  -H "Content-Type: application/json" \
  "${API_ROOT}/apps/${app_id}/deployments" \
  | ruby -rjson -e '
      data = JSON.parse(STDIN.read)
      Array(data["deployments"]).first(5).each do |deployment|
        puts "- #{deployment["id"]}: #{deployment["phase"]}"
      end
    '

echo "Deployment request submitted. Check the App Platform deployment log until it becomes ACTIVE."
