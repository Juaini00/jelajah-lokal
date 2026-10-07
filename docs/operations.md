# Operations

Runbooks for day-to-day operation of Jelajah Lokal: backup/restore, migration rollback, logging, and kill-switches. These procedures assume the environment variables and script paths in `README.md` and `.env.example`. Treat every command here as something to actually run and observe before claiming it works in `docs/verification.md` — this document describes the procedure, not a completed verification.

## Backup

### Local development (Docker Compose PostgreSQL)

```bash
docker compose -f infra/compose.yaml --env-file .env exec postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --file=/tmp/jelajah-backup.dump
docker compose -f infra/compose.yaml --env-file .env cp postgres:/tmp/jelajah-backup.dump ./backup-$(date +%Y%m%dT%H%M%S).dump
```

Store the resulting `.dump` file outside the repository (it is not git-ignored by default — do not commit it; it may contain private session/editorial data).

### Production (Neon)

Use `DATABASE_DIRECT_URL` (the non-pooled Neon connection) for backup/restore and migration operations, never `DATABASE_URL` (the pooled application connection):

```bash
pg_dump "$DATABASE_DIRECT_URL" --format=custom --file=jelajah-prod-$(date +%Y%m%dT%H%M%S).dump
```

Neon also retains automatic point-in-time recovery on its own schedule; a manual `pg_dump` is an additional, operator-controlled snapshot before risky operations (migrations, bulk edits), not a replacement for Neon's built-in recovery.

## Restore

```bash
pg_restore --clean --if-exists --no-owner -d "$DATABASE_DIRECT_URL" jelajah-prod-<timestamp>.dump
```

`--clean --if-exists` drops and recreates existing objects before restoring, so this is destructive to the target database's current state — confirm the target connection string before running it, and never run a restore against a database that still has traffic you intend to keep. After restoring, run migrations forward if the dump predates the current schema:

```bash
uv run --directory apps/api alembic upgrade head
```

## Migration rollback

Alembic migrations are reversible only to the extent each revision implements `downgrade()`. Before rolling back:

1. Confirm the target revision: `uv run --directory apps/api alembic history`
2. Take a fresh backup (see above) — a rollback that also loses data appended after the forward migration is possible and must be an explicit, informed decision.
3. Downgrade one revision: `uv run --directory apps/api alembic downgrade -1`, or to a specific revision: `uv run --directory apps/api alembic downgrade <revision>`

If a migration is not safely reversible (e.g. a destructive column drop), the correct rollback is restoring the pre-migration backup, not `alembic downgrade`. Decide which applies per-migration; do not assume all migrations are symmetric.

## Deployment rollback

FastAPI Cloud and static frontend hosts generally support redeploying a previous build/release rather than reverting source and rebuilding. Until a hosting target is chosen and an account is authenticated (see `docs/deployment.md`), the concrete rollback command cannot be stated truthfully; record the actual provider rollback command here once deployment is live.

## Logging

- Backend: structured application logs go to stdout/stderr (container/process logs); there is no separate log file by default in local development. Never log credential values, full `Authorization`/`X-CSRF-Token`/`X-MCP-API-Key` header values, Cloudinary secrets, Gemini API keys, or raw session cookies. `seed/prepare_assets.py` already follows this pattern (provider exception bodies are suppressed before printing).
- Errors returned to clients use the shared envelope `{error:{code,message,requestId,retryable}}`; `requestId` is the correlation key for matching a client-visible error to server logs — log it alongside the full internal exception server-side.
- Local Postgres container logs: `docker compose -f infra/compose.yaml --env-file .env logs -f postgres`

## Kill-switches

| Switch | Effect | How |
| --- | --- | --- |
| `AI_ENABLED=false` | Disables Gemini-backed editorial generation/apply; manual draft/publish CMS workflow remains fully usable | Set in `.env` (or provider secret store) and restart the API process |
| `MCP_ENABLED=false` | Disables the `/mcp` Streamable HTTP endpoint entirely | Set in `.env` (or provider secret store) and restart the API process |
| Rotate `MCP_API_KEY` | Immediately revokes all existing MCP client access (one shared key = one shared principal) | Generate a new value, update the secret store, restart the API process, redistribute the new key only to authorized holders |
| Rotate `ADMIN_SESSION_SECRET` | Invalidates all existing admin/editor sessions, forcing re-login | Generate a new value, update the secret store, restart the API process |
| Revoke a single session | Logs out one principal without affecting others | `POST /api/admin/logout` as that principal, or an operator-run database update against that session row if the account is compromised and the holder cannot log out themselves |

`AI_MOCK_MODE` exists in `.env.example` for forward compatibility but the current backend implementation explicitly rejects `AI_MOCK_MODE=true` at config load as a runtime fallback — it is not a production or staging kill-switch; isolated tests use explicit dependency doubles instead. Do not rely on it operationally until/unless that changes.

## Health checks

- `GET /healthz` — process liveness only (`{"status":"ok"}`), no database dependency
- `GET /readyz` — actual database connectivity check; returns 503 if the database is unreachable

Use `/readyz`, not `/healthz`, for deployment readiness gates and load-balancer health checks that should fail over on database outage.

## Open items for this document

- Production deployment rollback command: pending a chosen, authenticated FastAPI Cloud (and Astro host) account — see `docs/deployment.md`.
- Exact Neon connection string format and any provider-specific backup/PITR console steps: pending Neon project provisioning (no production connection strings are configured yet per `docs/implementation-status.md`).
