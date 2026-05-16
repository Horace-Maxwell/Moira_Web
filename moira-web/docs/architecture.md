# Moira Web Architecture

## Why This Folder Exists

The desktop application is built around SWT windows, canvases, dialogs, and file pickers. A server cannot run that UI model directly. The web migration needs a separate surface that can reuse calculation code without pulling in desktop-only behavior.

## Initial Architecture

```text
Browser
  |
  | HTTP
  v
MoiraWebServer
  |
  | REST endpoints
  v
MoiraBridge
  |
  | headless runtime adapter
  v
Existing ChartData/DataEntry code
```

## Production Runtime Shape

```text
DigitalOcean App Platform service
  |
  | PORT + health checks
  v
MoiraWebServer
  |
  | serves /, /styles.css, /app.js with ETag + gzip
  | serves /api/* as no-store JSON
  v
MoiraBridge -> HeadlessMoiraEngine -> legacy ChartData/DataEntry packages
```

## Boundary Rules

- Server code must not import `org.eclipse.swt.*`.
- Server code must not create `Display`, `Shell`, dialogs, or desktop windows.
- Shared calculation code should be called through a small bridge class.
- Browser UI should talk only to REST endpoints.
- Static assets and API responses should be served from one process first, then split only when needed.
- New web endpoints must be additive and must not remove the desktop implementation until parity is proven.
- Text-oriented browser views must stay selectable and copyable.

## Current Legacy Integration

The web server build now compiles the headless legacy packages:

- `src/org/athomeprojects/base`
- `src/org/athomeprojects/swisseph`

The primary bridge endpoints are:

```text
POST /api/chart/compute
POST /api/entries/pack
POST /api/entries/unpack
POST /api/datasets/export
POST /api/datasets/import
GET  /api/runtime/options
```

`/api/chart/compute` accepts a small JSON payload from the browser, creates an original `DataEntry`, runs the legacy `ChartData` calculation in a synchronized headless section, and returns:

- PNG chart output as `chartImage` / `chartPngBase64`
- selectable text pages for calculation, eight characters, and notes
- the packed legacy `DataEntry` string
- normalized input data

The entry pack/unpack endpoints preserve a compatibility path for existing Moira data strings without launching SWT windows.

The dataset endpoints preserve the full desktop `.mri` file boundary. The browser sends packed entries or MRI bytes as base64, and the server uses the original `DataSet` loader/saver against temporary files so the exported archive stays compatible with the desktop app.

The browser shell also consumes:

```text
GET /api/features
```

That endpoint exposes the no-downgrade migration manifest so the web UI keeps the desktop modes, tabs, text pages, and management surface visible while implementation moves behind the bridge.

## Selected Stack

- Backend: Java 11, `com.sun.net.httpserver.HttpServer`
- Frontend: static HTML/CSS/JS
- API style: REST JSON
- Database: none for the first DigitalOcean target; browser-local storage holds saved profiles
- Auth: none in phase 1
- Real-time: none in phase 1

This keeps the first server stable and dependency-light while the calculation core is being separated.

## Production Direction

The first production-friendly target is a Linux container running:

```text
java -jar /app/moira-web.jar --port=$PORT --static-dir=/app/client --resource-dir=/app/resources
```

On DigitalOcean App Platform this is packaged by `moira-web/Dockerfile` and configured by `moira-web/.do/app.yaml`. The Java server handles static compression and ETags itself, so no separate Nginx layer is required in this phase.

## Runtime Efficiency Choices

- Bounded request executor sized by `MOIRA_WEB_MAX_THREADS`.
- Maximum request body size controlled by `MOIRA_WEB_MAX_BODY_BYTES`.
- Static assets cached in memory and invalidated by size/mtime.
- Compressible static assets are pre-gzipped on load.
- JSON responses gzip when clients opt in and payloads are large enough.
- Static assets get ETag and short public cache headers; API responses remain `no-store`.
- The legacy calculation engine is guarded by a synchronized bridge because `ChartMode`, `Resource`, and some calculation state are static in the original desktop code.
- The Docker image copies Moira resource files into `/app/resources`, so App Platform does not need a writable install directory for chart calculation.
- `.mri` import/export uses temporary files only for legacy compatibility and deletes them immediately after each request.
