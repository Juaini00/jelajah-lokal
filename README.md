# Jelajah Lokal

Indonesian editorial travel-guide application: Astro SSR for readers, React for the private editor, FastAPI for content/authentication/editorial/MCP, PostgreSQL for persistence, Cloudinary for raster media, and the official Google Gemini SDK for metadata suggestions. There is no Strapi runtime, reader chatbot, public registration, autonomous publication, or paid-provider fallback.

See `docs/architecture.md` for the system boundary and legacy-to-FastAPI mapping, `contracts/implementation.md` for the frozen API contract, `docs/operations.md` for runbooks, `docs/deployment.md` for hosting, and `docs/demo-script.md` for a guided walkthrough. `docs/implementation-status.md` and `docs/verification.md` are coordinator-owned evidence records — do not infer completeness from this README alone.

## Repository layout

```
apps/web      Astro SSR reader site (public, published-only)
apps/admin    React private editor (served in production under FastAPI /admin/)
apps/api      FastAPI backend: content, auth, media, editorial AI, MCP
seed/         Seed dataset, asset manifest, asset preparation script
contracts/    Frozen API contract (implementation.md) and generated contracts/openapi.json / contracts/api.d.ts
infra/        Local Docker Compose PostgreSQL service
docs/         Architecture, operations, deployment, demo-script, PRD, implementation prompt
```

## Prerequisites

- Node `24.19.0` (see `.nvmrc`) and pnpm `10.33.4` (pinned via `packageManager` in `package.json`)
- Python `3.13.x` and `uv` for `apps/api`
- Docker, for the local PostgreSQL 18.3 service
- Bruno CLI (`@usebruno/cli`, installed as a root devDependency) for API acceptance tests

## 1. Install dependencies

```bash
pnpm install
uv sync --directory apps/api
```

## 2. Configure environment

Copy `.env.example` to `.env` at the repo root and fill in real values (Cloudinary credentials, `ADMIN_SESSION_SECRET`, `MCP_API_KEY`, `GEMINI_API_KEY`, database password, etc.). `.env` is git-ignored; never commit it. `API_CONTENT_TOKEN`, `ADMIN_SESSION_SECRET`, `MCP_API_KEY`, Cloudinary secrets and Gemini keys are backend-only and must never appear in frontend bundles, logs, or screenshots.

## 3. Start local PostgreSQL

```bash
docker compose -f infra/compose.yaml --env-file .env up -d
```

This starts a single Postgres 18.3-alpine container on loopback `127.0.0.1:${POSTGRES_PORT:-55438}` with a persistent named volume. Application and test databases (`jelajah` / `jelajah_test` by convention) are separate logical databases on the same server; `DATABASE_URL` and `TEST_DATABASE_URL` in `.env` must point at different databases so tests never touch development data.

## 4. Run database migrations

```bash
uv run --directory apps/api alembic upgrade head
```

## 5. Bootstrap an admin/editor account

There is no seeded default administrator. Create the first principal explicitly:

```bash
uv run --directory apps/api python -m scripts.bootstrap --username <username> --role admin
```

Omit `--password` to be prompted interactively; the password is never printed or logged. Run again with `--role editor` for editor accounts.

## 6. Seed illustrative content (optional, idempotent)

Seeding first requires approved Cloudinary assets to exist (see `seed/prepare_assets.py`, run by the asset owner, writing `seed/assets-manifest.json`). Once the manifest is present:

```bash
uv run --directory apps/api python -m scripts.seed
```

This calls backend content services directly (not HTTP), publishes through the same validation as the editor UI, never resets the database, and never creates a default admin account.

## 7. Run the apps in development

```bash
# FastAPI backend (http://127.0.0.1:8000)
# Note: `fastapi dev`/`fastapi run` mis-resolve this project's module path
# (no `__init__.py` under app/); use uvicorn directly instead.
cd apps/api && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Astro reader site (http://127.0.0.1:4321)
pnpm dev:web

# React admin editor, dev server with API proxy (not the production hosting path)
pnpm --filter admin dev
```

In production, the admin build is served by FastAPI itself under `/admin/` so cookie mutations stay same-origin; the Vite dev server above is a development convenience only.

## 8. Build and typecheck

```bash
pnpm build     # astro build (web) + tsc -b && vite build (admin)
pnpm check     # astro check (web) + tsc -b (admin)
```

Backend has no separate "build" step; `ruff` lint and `pytest` serve as its checks (see below).

## 9. Export the OpenAPI contract and generate frontend types

```bash
uv run --directory apps/api python -m scripts.export_openapi   # writes contracts/openapi.json
pnpm exec openapi-typescript contracts/openapi.json -o contracts/api.d.ts
```

Frontend code must use the generated `contracts/api.d.ts`, not hand-written DTOs, once this export exists.

## 10. Backend tests

```bash
uv run --directory apps/api pytest
```

Requires a real PostgreSQL `TEST_DATABASE_URL` (no SQLite substitution); never targets the development or production database.

## 11. API acceptance tests (Bruno)

With a running API instance (see §7 above), from the repo root:

```bash
pnpm api:acceptance   # cd tests/bruno && bru run --env local
```

The Bruno collection and its `local`/CI environments live under `tests/bruno/` (owned by acceptance testing) and exercise the routes frozen in `contracts/implementation.md`, including auth, CSRF, media, editorial, and MCP boundaries. Required secrets (`API_CONTENT_TOKEN`, `MCP_API_KEY`, `JELAJAH_TEST_ADMIN_USERNAME`/`PASSWORD`, `JELAJAH_TEST_EDITOR_USERNAME`/`PASSWORD`) must be exported in the shell first and must match a *freshly bootstrapped* admin/editor pair and a backend instance started against an isolated test database — running against the development database will show unrelated failures from prior state (stale quota, pre-existing drafts), not a script defect. CI (`.github/workflows/ci.yml`) starts the API via `uv run --directory apps/api python -m scripts.run_test_harness` instead of `uvicorn app.main:app` — this swaps in a deterministic fake Gemini client (`app/testing.py`) for the REST editorial generate/apply routes only, so CI gets real, repeatable AI-assistant coverage (including quota-exhaustion and concurrent-lease scenarios against the real database logic) without calling the actual Gemini API. The MCP server's `generate_metadata` tool always calls the real Gemini client regardless of which app module is served, so MCP generate/apply acceptance is not deterministic under this harness.

## Security notes

- Never commit `.env`, print credential values, or paste secrets into logs, issues, or screenshots.
- `API_CONTENT_TOKEN` authorizes only published-only public reads; it cannot authenticate any private route.
- `MCP_API_KEY` grants one shared admin-equivalent service principal — all MCP clients using it share identity and editorial-request ownership; rotate deliberately and restrict distribution.

## Further reading

- `docs/architecture.md` — system boundary, legacy mapping, auth/CSRF/MCP boundaries, AI safeguards, Neon portability, Cloudinary ownership
- `contracts/implementation.md` — frozen P0 API contract
- `docs/operations.md` — backup/restore/rollback, logging, kill-switch runbooks
- `docs/deployment.md` — FastAPI Cloud deployment steps
- `docs/demo-script.md` — guided walkthrough of the live application
