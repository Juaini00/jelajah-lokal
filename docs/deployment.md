# Deployment

## Status (live since 2026-10-07)

| Part | Host | URL |
|---|---|---|
| API + admin (`/admin/`) + MCP (`/mcp`) | FastAPI Cloud app `jelajah-lokal` (team Juaini, region us-east-1) | https://jelajah-lokal.fastapicloud.dev |
| Public site (Astro SSR) | Vercel project `juainiis-projects/jelajah-lokal`, root `apps/web`, auto-deploys `main` from GitHub `Juaini00/jelajah-lokal` | https://jelajah-lokal.vercel.app |
| Database | Neon (ap-southeast-1); app uses the pooled URL, migrations/seed the direct URL | — |

Observed after deploy: `/healthz` 200, `/readyz` 200, public articles API returns the 5 seeded guides, admin login sets `jelajah_session` Secure/HttpOnly/SameSite=Strict, Vercel pages 200 with `index, follow` and canonical on `jelajah-lokal.vercel.app`, unknown slug 404.

Production secrets generated for this deploy (`API_CONTENT_TOKEN`, `ADMIN_SESSION_SECRET`, `MCP_API_KEY`) and the production admin login live only in `.private/` (git-ignored) and in the platforms' secret env vars.

**Known latency:** API (us-east-1) talks to Neon in ap-southeast-1, so DB-bound requests take seconds. Moving the Neon project to a US East region (or the app closer to the DB) is the fix.

### Redeploy

```bash
pnpm --filter admin build                         # writes apps/api/admin_dist (git-ignored, shipped via apps/api/.fastapicloudignore)
uv run --directory apps/api fastapi deploy        # API + admin
git push origin main                              # Vercel rebuilds the public site
```
Env vars: `uv run --directory apps/api fastapi cloud env list` and `vercel env ls`. Migrations: run `alembic upgrade head` with `DATABASE_URL` set to the Neon **direct** URL (host without `-pooler`).

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

Hosted on Vercel. `astro.config.mjs` picks `@astrojs/vercel` when `VERCEL=1` (set by Vercel builds) and the standalone `@astrojs/node` adapter everywhere else, so local runs and the Dockerfile keep working:

```bash
pnpm --filter apps-web build
node apps/web/dist/server/entry.mjs
```

Vercel project settings: root directory `apps/web`, framework Astro, Node 24.x, include files outside the root (pnpm workspace). Production env vars: `SITE_URL`, `API_URL`, `API_CONTENT_TOKEN` (sensitive; must equal the API's value), `API_REQUEST_TIMEOUT_MS`, `ENVIRONMENT=production` (enables indexing).

## Admin editor (`apps/admin`)

Production admin is **not** deployed as a standalone static site. It is built and served by the FastAPI backend at `/admin/` so cookie-based mutations remain same-origin (see `docs/architecture.md`):

```bash
pnpm --filter admin build   # vite base /admin/, output in apps/api/admin_dist
```

`apps/api/app/main.py` mounts `apps/api/admin_dist` at `/admin/` with an SPA fallback. The folder is git-ignored but re-included for upload by `apps/api/.fastapicloudignore`, so always build the admin before `fastapi deploy`.

## Media: Cloudinary

No separate deployment step — Cloudinary is a managed SaaS accessed via `CLOUDINARY_*` credentials already described in `.env.example` and `docs/architecture.md`. Confirm the production Cloudinary account/folder (`CLOUDINARY_FOLDER=jelajah-lokal` by convention) is the same owned namespace used by `seed/prepare_assets.py`, not a separate unmanaged account.

## Post-deploy checklist (run, don't assume)

1. `GET /healthz` and `GET /readyz` on the deployed API both return 200.
2. Public reader site loads and successfully fetches from the deployed API (`API_URL` points at the deployed backend, not localhost).
3. Admin login works over HTTPS with `Secure`, `HttpOnly`, `SameSite=Strict` cookies (`ADMIN_COOKIE_SECURE=true` in production).
4. `/mcp` rejects requests without a valid `X-MCP-API-Key` and accepts them with the production `MCP_API_KEY`.
5. Record actual observed URLs, response codes, and timestamps in `docs/verification.md` (coordinator-owned) — this file intentionally contains no such claims.

## Open items

- Custom domain (optional): `fastapi cloud domains` / Vercel domains; update `API_PUBLIC_URL`, `ADMIN_ALLOWED_ORIGINS`, `MCP_ALLOWED_HOSTS` and `SITE_URL` accordingly.
- Region alignment between FastAPI Cloud and Neon (see Known latency).
