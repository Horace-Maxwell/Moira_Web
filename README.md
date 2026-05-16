# Moira Web

Standalone web deployment of Moira for DigitalOcean App Platform.

This repository contains only the web server, browser UI, calculation core sources, and runtime resources needed for the web app. The original macOS desktop release repository remains separate.

## Run locally

```bash
cd moira-web
./scripts/run-dev.sh
```

Open `http://localhost:8080`.

## Deploy

DigitalOcean App Platform can build this repo with `moira-web/Dockerfile`.
