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

## Deploy To DigitalOcean

The App Platform spec is stored at `moira-web/.do/app.yaml`. The live deployment uses a prebuilt Docker image in DigitalOcean Container Registry, so it does not depend on DigitalOcean's GitHub App permissions.

The current spec uses `apps-d-4vcpu-8gb` with one instance for short high-capacity checks. Scale it down or destroy the app when temporary testing is finished.

Build and push a new image:

```bash
docker build --platform linux/amd64 -f moira-web/Dockerfile \
  -t registry.digitalocean.com/moira-web-horace/moira-web:<tag> .
docker push registry.digitalocean.com/moira-web-horace/moira-web:<tag>
```

Update `moira-web/.do/app.yaml` to the same image tag, then deploy:

```bash
export DIGITALOCEAN_TOKEN=...
./moira-web/scripts/deploy-digitalocean.sh
```

To update an existing DigitalOcean app instead of creating a new one:

```bash
export DIGITALOCEAN_TOKEN=...
export DIGITALOCEAN_APP_ID=...
./moira-web/scripts/deploy-digitalocean.sh
```

The token is read only from the environment and is never stored in this repository.
