<div align="center">

# Moira Web Server / Moira 网页端服务器版

### Server-ready Moira web deployment
### 面向服务器稳定部署的 Moira 网页端版本

[![Repository](https://img.shields.io/badge/GitHub-Repository-3f3f46?logo=github&logoColor=white)](https://github.com/Horace-Maxwell/Moira_Web)
[![Platform](https://img.shields.io/badge/platform-Docker%20%7C%20DigitalOcean%20%7C%20Java-black)](https://github.com/Horace-Maxwell/Moira_Web)
[![Runtime](https://img.shields.io/badge/runtime-Java%2011%20headless-0f766e)](moira-web/server/)
[![Deployment](https://img.shields.io/badge/deployment-one--command%20Compose-2ea043)](scripts/deploy-local.sh)
[![Font](https://img.shields.io/badge/Linux%20font-AR%20PL%20UKai%20%2B%20Noto%20CJK-d97706)](moira-web/Dockerfile)
[![UI Gate](https://img.shields.io/badge/UI%20gate-Playwright%20layout%20check-2563eb)](moira-web/scripts/ui-layout-check.mjs)

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/Horace-Maxwell/Moira_Web/tree/main)

<p><strong>English:</strong> This repository isolates the Moira web version into a server-first project, so Docker deployment, DigitalOcean App Platform configuration, health checks, browser layout checks, and release gates can evolve without touching the macOS desktop release repository.</p>
<p><strong>中文：</strong>这个仓库把 Moira 网页端单独拆成服务器优先的项目，让 Docker 部署、DigitalOcean App Platform 配置、健康检查、浏览器布局验收和网页端 release 流程可以独立维护，不影响 macOS 桌面版仓库。</p>

</div>

## Start Here / 先看这里

| English | 中文 |
|---|---|
| Use this repository when you want to run Moira in a browser on a VPS, Docker host, or DigitalOcean App Platform. | 如果你要把 Moira 放到 VPS、Docker 主机或 DigitalOcean App Platform 上以网页方式运行，请使用这个仓库。 |
| The original macOS desktop app is intentionally not the deployment source for this project. | 原 macOS 桌面 App 不作为这个项目的部署源，两个仓库刻意分开。 |
| Production routing is intentionally simple: one Java service serves both the static browser UI and `/api/*`. | 生产路由刻意保持简单：一个 Java 服务同时提供静态网页和 `/api/*` 接口。 |
| The Docker image includes the calculation resources and Linux Chinese fonts needed for server rendering. | Docker 镜像内置计算资源和服务器端渲染所需的 Linux 中文字体。 |
| Browser data is currently local/stateless; no account system or shared database is required for first deployment. | 当前浏览器资料默认本地/无状态保存，首次部署不需要账号系统或共享数据库。 |

## What Is Included / 包含内容

| Path | English | 中文 |
|---|---|---|
| `moira-web/server/` | Java 11 HTTP service and headless bridge to the original Moira calculation core. | Java 11 HTTP 服务，以及连接原 Moira 计算核心的 headless bridge。 |
| `moira-web/client/` | Browser UI that recreates the desktop-style shell, chart pages, text pages, and data manager. | 浏览器 UI，还原桌面版外壳、盘面页面、文字页面和资料管理。 |
| `moira-web/scripts/` | Build, run, self-check, DigitalOcean deploy, golden-text, and browser layout scripts. | 构建、运行、自检、DigitalOcean 部署、文字基准和浏览器布局检查脚本。 |
| `moira-web/.do/app.yaml` | DigitalOcean App Platform service spec using a prebuilt Docker image. | 使用预构建 Docker 镜像的 DigitalOcean App Platform 服务配置。 |
| `compose.yaml` | Portable Docker Compose deployment for any server with Docker Compose v2. | 适用于任意 Docker Compose v2 服务器的一键部署配置。 |
| `scripts/` | Root-level deployment and verification helpers. | 根目录的一键部署和线上验收脚本。 |
| `src/`, `lib/`, `ephe/`, `icon/`, `*.prop`, `cities.prop` | Legacy Moira source, SWT jar, ephemeris files, icons, localization text, and city data required by the calculation and chart engine. | legacy Moira 源码、SWT jar、星历文件、图标、本地化文本和城市资料，是计算与盘面引擎运行所需资源。 |

The copy intentionally excludes local caches, `node_modules`, temporary build folders, private `.env` files, logs, and local runtime state.

本仓库刻意排除本地缓存、`node_modules`、临时构建目录、私有 `.env`、日志和本机运行状态。

## Feature Surface / 功能范围

| English | 中文 |
|---|---|
| The web service calls the original Moira `ChartData` engine headlessly and returns PNG chart output plus text pages. | 网页服务会以 headless 方式调用原 Moira `ChartData` 引擎，并返回 PNG 盘面与文字页面。 |
| Current modes include 七政四余星盘, 天星择日, 占星盘, and 郑氏星案. | 当前模式包括七政四余星盘、天星择日、占星盘和郑氏星案。 |
| The browser shell exposes 星盘、生年、流年、计算、八字、批注、管理 and related text pages. | 浏览器外壳包含星盘、生年、流年、计算、八字、批注、管理等页面。 |
| The data manager supports local browser state and legacy `.mri` import/export. | 资料管理支持浏览器本地状态，以及 legacy `.mri` 汇入/汇出。 |
| Some desktop menu entries remain compatibility surfaces until the matching web dialog is fully implemented. | 部分桌面菜单项目前仍属于兼容入口，等待对应网页对话框完全实现。 |

## Server Sizing / 服务器配置建议

| Scenario / 场景 | CPU | RAM | Notes / 说明 |
|---|---:|---:|---|
| Private testing / 私人测试 | 1-2 vCPU | 1-2GB | Good for light use and local verification. / 适合轻量使用和本地验收。 |
| Stable public demo / 稳定公开演示 | 2 vCPU | 4GB | Recommended baseline for a small public server. / 小规模公开服务的建议起点。 |
| Short high-capacity App Platform check / 短时间高规格 App Platform 验收 | 4 vCPU | 8GB | Current DigitalOcean spec uses `apps-d-4vcpu-8gb`; scale down or destroy when done. / 当前 DigitalOcean 配置使用 `apps-d-4vcpu-8gb`，测试结束后请降配或删除。 |

Most load comes from chart rendering and Java heap. The service is intentionally stateless so it can restart cleanly and deploy without a database.

主要负载来自盘面渲染和 Java 堆。服务刻意保持无状态，因此可以干净重启，也不依赖数据库部署。

## One-Command Server Deploy / 一键服务器部署

On any server with Docker and Docker Compose v2:

任意已安装 Docker 与 Docker Compose v2 的服务器：

```bash
git clone https://github.com/Horace-Maxwell/Moira_Web.git
cd Moira_Web
./scripts/deploy-local.sh
```

By default this builds the image locally, starts Moira Web on port `8080`, waits for `/health` and `/ready`, then verifies the deployment.

默认会本地构建镜像，在 `8080` 端口启动 Moira Web，等待 `/health` 与 `/ready`，然后执行部署验收。

Use a different host port:

指定其他宿主机端口：

```bash
MOIRA_WEB_PORT=18080 ./scripts/deploy-local.sh
```

Verify a public reverse-proxy URL while keeping the container local:

容器仍走本地端口，但验收公开反向代理域名：

```bash
MOIRA_WEB_PORT=18080 \
MOIRA_WEB_VERIFY_URL=https://your-domain.example \
./scripts/deploy-local.sh
```

Enable the stricter browser-rendered layout gate:

启用更严格的浏览器真实渲染布局检查：

```bash
MOIRA_WEB_UI_CHECK=true ./scripts/deploy-local.sh
```

If the server does not already have Playwright Chromium installed, run once:

如果服务器尚未安装 Playwright Chromium，可先执行一次：

```bash
npx playwright install --with-deps chromium
```

## DigitalOcean App Platform / DigitalOcean App Platform

The App Platform spec lives at [`moira-web/.do/app.yaml`](moira-web/.do/app.yaml). It uses a prebuilt Docker image from DigitalOcean Container Registry so deployments do not depend on DigitalOcean's GitHub App permissions.

App Platform 配置位于 [`moira-web/.do/app.yaml`](moira-web/.do/app.yaml)。它使用 DigitalOcean Container Registry 中的预构建 Docker 镜像，因此部署不依赖 DigitalOcean GitHub App 权限。

Build and push a `linux/amd64` image, then update the app:

构建并推送 `linux/amd64` 镜像，然后更新 App：

```bash
export DIGITALOCEAN_TOKEN=...
export DIGITALOCEAN_APP_ID=... # omit this to create a new app / 留空则创建新 App
DIGITALOCEAN_BUILD_IMAGE=true ./moira-web/scripts/deploy-digitalocean.sh
```

If the image tag in `.do/app.yaml` already exists in DOCR:

如果 `.do/app.yaml` 中的镜像 tag 已经存在于 DOCR：

```bash
export DIGITALOCEAN_TOKEN=...
export DIGITALOCEAN_APP_ID=...
./moira-web/scripts/deploy-digitalocean.sh
```

The helper waits for the newest deployment to become `ACTIVE` and then runs the same production verifier against the live URL. Use `DIGITALOCEAN_WAIT=false` only when you intentionally want to submit and monitor elsewhere.

部署脚本会等待最新 deployment 变为 `ACTIVE`，然后对线上 URL 执行同一套生产验收。只有在你明确想提交后自行监控时，才使用 `DIGITALOCEAN_WAIT=false`。

## Local Development / 本地开发

```bash
cd moira-web
./scripts/run-dev.sh
```

Open:

打开：

```text
http://localhost:8080
```

Useful endpoints:

常用端点：

```text
GET  /health
GET  /ready
GET  /api/version
GET  /api/runtime/options
GET  /api/features
POST /api/chart/compute
POST /api/datasets/export
POST /api/datasets/import
```

## Verification Gates / 验收检查

| Command / 命令 | English | 中文 |
|---|---|---|
| `./moira-web/scripts/self-check.sh 18124` | Build and run a local production self-check with golden text fixtures. | 构建并运行本地生产自检，同时校验文字基准。 |
| `./scripts/verify-deployment.sh https://your-live-url.example` | Verify a running deployment's health, APIs, chart output, text output, fonts, gzip, ETag, and cache headers. | 校验已运行部署的健康端点、API、盘面输出、文字输出、字体、gzip、ETag 和缓存头。 |
| `./scripts/verify-ui-layout.sh https://your-live-url.example` | Open the real page in Chromium and check the desktop-like shell, control panel, chart alignment, menu cascade, and management table. | 在 Chromium 中打开真实页面，检查桌面式外壳、控制面板、盘面位置、菜单级联和管理表格。 |

Run all local browser layout checks from the repository root:

从仓库根目录运行本地浏览器布局检查：

```bash
npm ci
npx playwright install chromium
./moira-web/scripts/ui-layout-check.sh 18183
```

## Release Workflow / Release 流程

GitHub Actions runs production self-checks, golden fixtures, browser layout checks, one-command Docker Compose deployment, and a `linux/amd64` Docker build on `main`, pull requests, and tagged web releases.

GitHub Actions 会在 `main`、pull request 和网页端 release tag 上运行生产自检、文字基准、浏览器布局检查、一键 Docker Compose 部署，以及 `linux/amd64` Docker 构建。

Publish a web release with a tag:

使用 tag 发布网页端 release：

```bash
git tag web-v1.0.0
git push origin web-v1.0.0
```

The release workflow publishes a GHCR image and uploads the built jar plus source archive. DigitalOcean deployments can continue to use DOCR through `./moira-web/scripts/deploy-digitalocean.sh`.

Release workflow 会发布 GHCR 镜像，并上传构建后的 jar 与源码归档。DigitalOcean 部署仍可通过 `./moira-web/scripts/deploy-digitalocean.sh` 使用 DOCR。

## Configuration / 配置

Copy [`moira-web/.env.example`](moira-web/.env.example) when you need explicit local settings:

需要显式本地配置时，可参考 [`moira-web/.env.example`](moira-web/.env.example)：

```bash
MOIRA_WEB_PORT=8080
MOIRA_WEB_STATIC_CACHE=true
MOIRA_WEB_MAX_THREADS=8
MOIRA_WEB_MAX_BODY_BYTES=2097152
MOIRA_WEB_UI_CHECK=false
DIGITALOCEAN_BUILD_IMAGE=false
```

Never commit real tokens or private `.env` files.

不要提交真实 token 或私有 `.env` 文件。

## Maintainer Notes / 维护说明

| English | 中文 |
|---|---|
| Keep the macOS desktop repository separate from this web deployment repository. | 保持 macOS 桌面仓库与本网页部署仓库分离。 |
| Do not claim full desktop parity until a feature has a web implementation and a verification fixture. | 功能没有网页实现和验收 fixture 前，不要宣称完整桌面等价。 |
| Keep DigitalOcean image tags, `.do/app.yaml`, and release notes in sync when shipping. | 发布时保持 DigitalOcean 镜像 tag、`.do/app.yaml` 和 release notes 同步。 |
| Prefer adding verification scripts over relying on manual screenshots only. | 优先补自动验收脚本，不要只依赖手动截图判断。 |

## Acknowledgements / 致谢

This web server edition continues from the classic Moira Java/SWT desktop application and preserves its calculation resources while making the app easier to deploy on modern servers.

这个网页端服务器版延续自经典 Moira Java/SWT 桌面程序，保留其计算资源，并把它整理成更适合现代服务器部署的形式。

Special thanks to the upstream Moira work and the related macOS adaptation efforts that made this migration possible.

特别感谢上游 Moira 项目以及相关 macOS 适配工作的贡献，它们让这次网页端迁移有了基础。
