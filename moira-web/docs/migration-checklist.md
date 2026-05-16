# Migration Checklist

## Phase 1: Web Shell

- [x] Create isolated root folder for web migration.
- [x] Add Java HTTP server scaffold.
- [x] Serve static browser UI.
- [x] Add `/health`, `/ready`, and `/api/version`.
- [x] Add `/api/features` no-downgrade manifest.
- [x] Add smoke-test script.

## Phase 2: Headless Calculation Bridge

- [x] Compile the legacy headless packages into the web service build.
- [x] Add a first legacy bridge endpoint using the original `DataEntry` model.
- [x] Identify the minimum classes needed for one chart calculation.
- [x] Remove or wrap SWT dependencies from that path.
- [x] Add a request DTO for name, sex, birth date, location, and timezone.
- [x] Add a response DTO for text output, packed data, and PNG chart output.
- [x] Add local self-check coverage for 七政四余、天星择日、占星盘、郑氏星案.
- [ ] Add golden-file regression fixtures comparing desktop and web calculation output.

## Phase 3: Browser Views

- [x] Rebuild the input panel in HTML.
- [x] Restore visible coverage for all desktop modes, tabs, and text pages.
- [x] Rebuild text result pages with real calculation output.
- [x] Render the chart image from the legacy drawing engine.
- [x] Add browser-local profile export/import support.
- [x] Add mobile layout.

## Phase 4: Persistence

- [x] Use browser-local persistence for the first stateless DigitalOcean App Platform target.
- [x] Add saved profiles in localStorage.
- [x] Add JSON import/export for saved browser profiles.
- [x] Add legacy `DataEntry` pack/unpack endpoints.
- [x] Add full legacy `.mri` import/export endpoints.
- [ ] Add database-backed accounts if shared multi-device persistence becomes required.

## Phase 5: Production

- [x] Add Dockerfile.
- [x] Add DigitalOcean App Platform service spec.
- [x] Add bounded thread pool, request body limits, gzip, ETag, and static cache.
- [x] Add structured access logs.
- [x] Add production self-check script.
- [x] Package resource files into the Docker runtime image.
- [x] Configure DigitalOcean resource/static paths and health checks.
- [x] Make the DigitalOcean helper wait for ACTIVE and verify the live URL.
- [ ] Put the service behind HTTPS through the production domain.
- [ ] Add backup strategy if server-side user storage is introduced.
- [ ] Add release workflow for web builds.
