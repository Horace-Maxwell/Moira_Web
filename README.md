# Moira Web

Standalone web deployment of Moira for DigitalOcean App Platform.

This repository contains only the web server, browser UI, calculation core sources, and runtime resources needed for the web app. The original macOS desktop release repository remains separate and is not used as the deployment source.

## Run Locally

```bash
cd moira-web
./scripts/run-dev.sh
```

Open `http://localhost:8080`.

For a full build and smoke test from the repository root:

```bash
./moira-web/scripts/self-check.sh 18124
```

## One-Command Server Deploy

On any server with Docker and Docker Compose v2:

```bash
git clone https://github.com/Horace-Maxwell/Moira_Web.git
cd Moira_Web
./scripts/deploy-local.sh
```

By default this builds the web image locally, starts it on port `8080`, waits for `/health` and `/ready`, then prints the URL. To use a different host port:

```bash
MOIRA_WEB_PORT=18080 ./scripts/deploy-local.sh
```

If the server is behind a reverse proxy or public domain, keep the container check local but verify the public URL:

```bash
MOIRA_WEB_PORT=18080 \
MOIRA_WEB_VERIFY_URL=https://your-domain.example \
./scripts/deploy-local.sh
```

The script checks Docker, Docker Compose, curl, `/health`, `/ready`, the desktop-style menu shell, chart rendering, static gzip, ETag, cache headers, and the compact Mac-like chart overlay layout.

To verify an already running deployment:

```bash
./scripts/verify-deployment.sh http://127.0.0.1:8080
```

## Deploy To DigitalOcean

The App Platform spec is stored at `moira-web/.do/app.yaml`. The live deployment uses a prebuilt Docker image in DigitalOcean Container Registry, so it does not depend on DigitalOcean's GitHub App permissions.

The current spec uses `apps-d-4vcpu-8gb` with one instance for short high-capacity checks. Scale it down or destroy the app when temporary testing is finished.

The easiest path is to let the deployment helper build and push the Docker image before it updates App Platform. It builds `linux/amd64` by default, which avoids the common Apple Silicon issue where a locally built `arm64` image cannot start on DigitalOcean App Platform.

```bash
export DIGITALOCEAN_TOKEN=...
export DIGITALOCEAN_APP_ID=... # omit this to create a new app
DIGITALOCEAN_BUILD_IMAGE=true ./moira-web/scripts/deploy-digitalocean.sh
```

The runtime image keeps Moira's original `font_name` cascade and installs `fonts-arphic-ukai` plus `fonts-noto-cjk`, so Linux servers fall back to the classic AR PL UKai-style rendering instead of the newer WenKai screen font.

If you intentionally want to build and push manually, use `buildx` and keep the tag in `moira-web/.do/app.yaml` in sync:

```bash
docker buildx build --platform linux/amd64 -f moira-web/Dockerfile \
  -t registry.digitalocean.com/moira-web-horace/moira-web:<tag> \
  --push .
```

Then deploy without rebuilding:

```bash
export DIGITALOCEAN_TOKEN=...
export DIGITALOCEAN_APP_ID=... # omit this to create a new app
./moira-web/scripts/deploy-digitalocean.sh
```

The DigitalOcean deploy script now waits for the newest deployment to become `ACTIVE` and then runs `./scripts/verify-deployment.sh` against the live URL. Set `DIGITALOCEAN_WAIT=false` to submit only, or `DIGITALOCEAN_VERIFY=false` to skip live verification.

The token is read only from the environment and is never stored in this repository.

## Deployment Gates

Before considering a deployment healthy, run one of these:

```bash
./moira-web/scripts/self-check.sh 18124
./scripts/verify-deployment.sh https://your-live-url.example
```

The checks cover the main HTML shell, original-style menu labels, runtime font availability, `/health`, `/ready`, `/api/version`, `/api/runtime/options`, `/api/features`, all four chart modes, text output, gzip, ETag, and static cache headers.
The local self-check additionally compares all four modes against committed golden text fixtures captured from the legacy calculation bridge.

## Web Release Workflow

GitHub Actions runs the same production gate on `main` and pull requests. It also builds a `linux/amd64` Docker image so release regressions are caught before someone deploys from another server.

To publish a web release, push a tag named `web-vX.Y.Z`:

```bash
git tag web-v1.0.0
git push origin web-v1.0.0
```

The release workflow verifies the app, publishes a GHCR image, and attaches the built jar plus a source archive to the GitHub Release. DigitalOcean deployments can still use DOCR through `./moira-web/scripts/deploy-digitalocean.sh`; GHCR is a portable release artifact for non-DigitalOcean servers.
