# Deployment

## Status

**No hosting account is currently authenticated for this project.** `uv run --directory apps/api fastapi cloud whoami` previously returned `No credentials found` (see `docs/implementation-status.md`). No FastAPI Cloud project, Astro hosting target, or Neon project has been provisioned yet. This document describes the real CLI steps to follow once an owner-approved account exists; it does not claim any URL, project, or deployment already exists. Do not invent deployment URLs, project names, or dashboard screenshots.

## Backend: FastAPI Cloud

The `fastapi[standard]` dependency in `apps/api/pyproject.toml` provides the official `fastapi` CLI, including its `cloud` subcommand group and a top-level `deploy` command.

1. Authenticate (interactive browser login):
   ```bash
   uv run --directory apps/api fastapi cloud login
   ```
2. Confirm the authenticated identity:
   ```bash
   uv run --directory apps/api fastapi cloud whoami
   ```
3. Deploy the current `apps/api` project:
   ```bash
   uv run --directory apps/api fastapi deploy
   ```
   On first run this creates a FastAPI Cloud app/project tied to this directory; subsequent runs redeploy to the same project. The actual resulting URL is assigned by FastAPI Cloud at deploy time — it must be recorded here (or in `docs/verification.md`, coordinator-owned) only after an actual deploy is observed, never guessed in advance.
4. Logout, if needed: `uv run --directory apps/api fastapi cloud logout`

### Required configuration before a real deploy

Set these as FastAPI Cloud project secrets/environment variables (never commit them, never put them in a public-prefixed name): `DATABASE_URL`, `DATABASE_DIRECT_URL`, `ADMIN_SESSION_SECRET`, `ADMIN_COOKIE_SECURE=true`, `ADMIN_ALLOWED_ORIGINS` (production admin origin only), `CORS_ALLOWED_ORIGINS`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_ENABLED`, `MCP_API_KEY`, `MCP_ALLOWED_HOSTS` (production host only), `MEDIA_ALLOWED_HOSTS`, `ENVIRONMENT=production`.

Run migrations against the production database before or immediately after the first deploy that depends on them:

```bash
uv run --directory apps/api alembic upgrade head
```

using `DATABASE_DIRECT_URL` configured for the Neon direct (non-pooled) connection in the environment the command runs from.

## Database: Neon

1. Provision a Neon project and database (owner action; requires an approved Neon account — none exists yet per `docs/implementation-status.md`).
2. Collect both connection strings Neon provides: the pooled (PgBouncer) connection for `DATABASE_URL`, and the direct connection for `DATABASE_DIRECT_URL`. Require TLS (`sslmode=require` or equivalent) on both; do not disable certificate verification when translating the URL for `asyncpg`.
3. Set `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` so that `instances × workers × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` stays within Neon's connection limit for the provisioned tier, with headroom for migrations/backup/admin connections run outside the app (see `docs/architecture.md`).
4. Run `uv run --directory apps/api alembic upgrade head` against `DATABASE_DIRECT_URL` before pointing the live app at the new database.

## Frontend: Astro reader site (`apps/web`)

No owner-approved hosting target or account has been selected (per `docs/implementation-status.md`). `apps/web` uses `@astrojs/node` in standalone mode, so it produces a portable Node server build:

```bash
pnpm --filter apps-web build
node apps/web/dist/server/entry.mjs
```

This runs anywhere Node 24.19.0 is available (container, VM, or a Node-compatible PaaS). The concrete hosting provider and its deploy command are an open decision; do not fabricate a provider-specific command (e.g. a specific PaaS CLI) until one is chosen. Required runtime environment variables for the server build: `SITE_URL`, `API_URL`, `API_CONTENT_TOKEN`, `API_REQUEST_TIMEOUT_MS`, `HOST`, `PORT`, `NODE_ENV=production`.

## Admin editor (`apps/admin`)

Production admin is **not** deployed as a standalone static site. It is built and served by the FastAPI backend at `/admin/` so cookie-based mutations remain same-origin (see `docs/architecture.md`):

```bash
pnpm --filter admin build   # vite base /admin/, output in apps/admin/dist
```

The backend owner integrates serving `apps/admin/dist` as static files under `/admin/` as part of the FastAPI Cloud deploy; the exact static-mount wiring is backend implementation scope, not a separate hosting step.

## Media: Cloudinary

No separate deployment step — Cloudinary is a managed SaaS accessed via `CLOUDINARY_*` credentials already described in `.env.example` and `docs/architecture.md`. Confirm the production Cloudinary account/folder (`CLOUDINARY_FOLDER=jelajah-lokal` by convention) is the same owned namespace used by `seed/prepare_assets.py`, not a separate unmanaged account.

## Post-deploy checklist (run, don't assume)

1. `GET /healthz` and `GET /readyz` on the deployed API both return 200.
2. Public reader site loads and successfully fetches from the deployed API (`API_URL` points at the deployed backend, not localhost).
3. Admin login works over HTTPS with `Secure`, `HttpOnly`, `SameSite=Strict` cookies (`ADMIN_COOKIE_SECURE=true` in production).
4. `/mcp` rejects requests without a valid `X-MCP-API-Key` and accepts them with the production `MCP_API_KEY`.
5. Record actual observed URLs, response codes, and timestamps in `docs/verification.md` (coordinator-owned) — this file intentionally contains no such claims.

## Open items

- FastAPI Cloud account: not authenticated. Requires owner login via `fastapi cloud login`.
- Astro hosting provider: not chosen.
- Neon project: not provisioned; no production connection strings exist yet.
- Once all three exist, this document's command sequences should be executed in order (Neon → migrate → FastAPI Cloud deploy → Astro host deploy) and the real resulting URLs recorded in `docs/verification.md`, not here.
