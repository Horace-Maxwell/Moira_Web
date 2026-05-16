# Moira Web Migration

This folder is the dedicated workspace for moving Moira from a Java/SWT desktop app to a web application.

The first goal is stability: keep the existing desktop app untouched, create a web server that runs reliably, and migrate the calculation core behind REST endpoints in small, testable steps. The current web service now calls the original Moira `ChartData` engine headlessly and returns both text pages and PNG chart output.

## Current Shape

- `server/`: Java 11 HTTP service with zero external runtime dependencies.
- `client/`: Static browser UI served by the Java service, including the desktop-like chart shell, text pages, editable data table, local archive state, and legacy `.mri` import/export.
- `docs/`: Architecture notes and migration checklist.
- `scripts/`: Build, run, and smoke-test helpers.
- `.do/app.yaml`: DigitalOcean App Platform service spec.
- `Dockerfile`: Container build that packages the web UI and Java API together.

## Compatibility Rule

The web migration is additive. The desktop app remains the source of truth until a web endpoint has a parity fixture for the same feature. The browser shell therefore lists every major desktop surface first:

- 七政四余星盘、天星择日、占星盘、郑氏星案
- 星盘、生年、流年、计算、八字、批注、管理
- 计算全文、八字全文、批注全文、资料管理

## Run Locally

```bash
cd moira-web
./scripts/run-dev.sh
```

Then open:

```text
http://localhost:8080
```

Useful checks:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/ready
curl http://localhost:8080/api/version
curl http://localhost:8080/api/runtime/options
curl http://localhost:8080/api/features
curl http://localhost:8080/api/chart/preview
```

Compute a chart through the headless legacy core:

```bash
curl --header 'Content-Type: application/json' \
  --data '{"mode":"traditional","name":"DHX","sex":"male","birthDate":"2006-04-10","birthTime":"09:58","nowDate":"2026-04-09","nowTime":"12:30","country":"中国","city":"上海","zone":"Asia/Shanghai","imageWidth":"720","imageHeight":"540"}' \
  http://localhost:8080/api/chart/compute
```

Pack a browser request into the legacy Moira `DataEntry` format:

```bash
curl --header 'Content-Type: application/json' \
  --data '{"name":"DHX","sex":"male","birthDate":"2006-04-10","birthTime":"09:58","country":"中国","city":"上海, 中国","zone":"Asia/Shanghai"}' \
  http://localhost:8080/api/entries/pack
```

Unpack a legacy Moira `DataEntry` string:

```bash
curl --header 'Content-Type: application/json' \
  --data '{"packedEntry":"..."}' \
  http://localhost:8080/api/entries/unpack
```

The browser data manager is editable in-place, supports normal text selection on the calculation pages, keeps local browser state, warns before leaving with changed data, and can export/import full legacy `.mri` archives. The matching API endpoints are:

```text
POST /api/datasets/export
POST /api/datasets/import
```

## Configuration

Copy `.env.example` values into your shell if you need to override defaults.

```bash
export MOIRA_WEB_PORT=8080
export MOIRA_WEB_STATIC_DIR=client
export MOIRA_WEB_RESOURCE_DIR=..
export MOIRA_WEB_CORS_ORIGIN=http://localhost:8080
export MOIRA_WEB_STATIC_CACHE=true
export MOIRA_WEB_MAX_THREADS=8
export MOIRA_WEB_MAX_BODY_BYTES=2097152
```

DigitalOcean App Platform injects `PORT`; the server reads it automatically when `MOIRA_WEB_PORT` is not set.

## Production Run

```bash
cd moira-web
./scripts/build-server.sh
./scripts/start-production.sh
```

The production runner uses a bounded thread pool, static asset ETags, gzip for compressible assets, and conservative JVM memory defaults.

## DigitalOcean App Platform

Use the included Docker-based service spec:

```bash
doctl apps create --spec moira-web/.do/app.yaml
```

This deploys one public service that serves both the frontend and `/api/*` routes. That is intentional for the first stable phase: it avoids CORS drift and keeps the frontend version matched to the Java bridge. DigitalOcean's app spec supports Dockerfile builds, service `http_port`, health checks, and an injected `PORT` environment variable for the service process.

## Self-Check

```bash
cd moira-web
./scripts/self-check.sh
```

The self-check builds the server, starts the production runner on a temporary local port, verifies HTML/API endpoints, checks the desktop feature manifest, computes all four chart modes, confirms `DataEntry` packing, round-trips a `.mri` archive, and asserts gzip + ETag static asset behavior.

## Migration Strategy

1. Keep the desktop release path working.
2. Expose a small web service beside it.
3. Move data and calculation-only code into a headless bridge.
4. Rebuild chart and text views in the browser.
5. Keep user profile data browser-local for the first stateless DigitalOcean deployment, then add database-backed sessions only when shared accounts are needed.

See [docs/architecture.md](docs/architecture.md) and [docs/migration-checklist.md](docs/migration-checklist.md).
