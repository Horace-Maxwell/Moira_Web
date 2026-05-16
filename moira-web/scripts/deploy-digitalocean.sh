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
tmp_deployments="$(mktemp)"
tmp_deployment="$(mktemp)"
tmp_app="$(mktemp)"
trap 'rm -f "${tmp_spec}" "${tmp_response}" "${tmp_deployments}" "${tmp_deployment}" "${tmp_app}"' EXIT

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
  "${API_ROOT}/apps/${app_id}/deployments" > "${tmp_deployments}"
ruby -rjson -e '
  data = JSON.parse(File.read(ARGV.fetch(0)))
  Array(data["deployments"]).first(5).each do |deployment|
    puts "- #{deployment["id"]}: #{deployment["phase"]}"
  end
' "${tmp_deployments}"

deployment_id="$(ruby -rjson -e '
  data = JSON.parse(File.read(ARGV.fetch(0)))
  deployment = Array(data["deployments"]).first
  puts deployment ? deployment["id"].to_s : ""
' "${tmp_deployments}")"

if [[ -z "${deployment_id}" ]]; then
  echo "Deployment request submitted, but no deployment id was returned yet." >&2
  echo "Check the App Platform deployment log for app ${app_id}." >&2
  exit 0
fi

echo "Deployment id: ${deployment_id}"

if [[ "${DIGITALOCEAN_WAIT:-true}" != "true" ]]; then
  echo "Deployment request submitted. Waiting skipped because DIGITALOCEAN_WAIT is not true."
  exit 0
fi

wait_seconds="${DIGITALOCEAN_WAIT_SECONDS:-900}"
poll_seconds="${DIGITALOCEAN_POLL_SECONDS:-10}"
elapsed=0

echo "Waiting for deployment to become ACTIVE..."
while (( elapsed <= wait_seconds )); do
  deploy_status="$(curl -sS -o "${tmp_deployment}" -w "%{http_code}" \
    -H "Authorization: Bearer ${DIGITALOCEAN_TOKEN}" \
    -H "Content-Type: application/json" \
    "${API_ROOT}/apps/${app_id}/deployments/${deployment_id}")"

  if [[ "${deploy_status}" != "200" ]]; then
    echo "Could not read deployment ${deployment_id}; HTTP ${deploy_status}." >&2
    cat "${tmp_deployment}" >&2
    exit 1
  fi

  phase="$(ruby -rjson -e '
    data = JSON.parse(File.read(ARGV.fetch(0)))
    puts data.dig("deployment", "phase").to_s
  ' "${tmp_deployment}")"
  echo "- ${deployment_id}: ${phase:-UNKNOWN}"

  case "${phase}" in
    ACTIVE)
      break
      ;;
    ERROR|CANCELED|SUPERSEDED)
      echo "Deployment ${deployment_id} ended as ${phase}." >&2
      ruby -rjson -e '
        data = JSON.parse(File.read(ARGV.fetch(0)))
        puts JSON.pretty_generate(data["deployment"] || data)
      ' "${tmp_deployment}" >&2
      exit 1
      ;;
  esac

  sleep "${poll_seconds}"
  elapsed=$((elapsed + poll_seconds))
done

if [[ "${phase:-}" != "ACTIVE" ]]; then
  echo "Timed out after ${wait_seconds}s waiting for deployment ${deployment_id}." >&2
  exit 1
fi

app_snapshot_status="$(curl -sS -o "${tmp_app}" -w "%{http_code}" \
  -H "Authorization: Bearer ${DIGITALOCEAN_TOKEN}" \
  -H "Content-Type: application/json" \
  "${API_ROOT}/apps/${app_id}")"
if [[ "${app_snapshot_status}" == "200" ]]; then
  live_url="$(ruby -rjson -e '
    data = JSON.parse(File.read(ARGV.fetch(0)))
    puts(data.dig("app", "live_url") || data.dig("app", "default_ingress") || "")
  ' "${tmp_app}")"
fi

echo "Deployment is ACTIVE."
if [[ -n "${live_url}" ]]; then
  echo "Live URL: ${live_url}"
fi

if [[ "${DIGITALOCEAN_VERIFY:-true}" == "true" && -n "${live_url}" && -x "${ROOT_DIR}/scripts/verify-deployment.sh" ]]; then
  echo "Verifying live deployment..."
  "${ROOT_DIR}/scripts/verify-deployment.sh" "${live_url}"
fi
