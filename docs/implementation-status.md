# Implementation status

Status as of 2026-10-07 (UTC): all reachable P0 work is implemented and verified end-to-end against real running services (PostgreSQL, Cloudinary, Gemini). Production deployment is the only remaining work, blocked exclusively by the three named external prerequisites in §2 below — everything that does not depend on them is complete.

## 1. P0 requirement checklist with evidence

| Requirement | State | Evidence |
|---|---|---|
| Dedicated repository, safe ignores, PRD preserved intact | Done | `jelajah-lokal/` isolated Git repo; `docs/PRD.md`/`docs/IMPLEMENTATION_PROMPT.md` verbatim copies |
| Pinned runtimes/dependencies, lockfiles | Done | Node 24.19.0, pnpm 10.33.4, Python 3.13.14 (`uv.lock`/`pnpm-lock.yaml` committed), exact-pinned direct dependencies |
| Complete safe `.env.example`; corrected Cloudinary secret name | Done | `.env.example`; application `.env` normalizes `CLOUDINARY_API_SECRET`, parent workspace untouched |
| Structural draft/published content model + migration | Done | `Article` (mutable draft) + immutable `PublishedSnapshot` + pointer; real FK `RESTRICT`/`CASCADE` constraints (verified via `psql \d articles`); Alembic `0001_initial` applies cleanly to a real database |
| Public published-only API (list/detail/categories/sitemap) | Done | Verified via `curl` (§3 of `verification.md`): draft 404, category filter, sitemap, pagination, allowlisted query params |
| Admin auth: login/logout/session expiry, Argon2, revocable sessions | Done | Real login/logout/session exercised via browser; `pwdlib[argon2]` hashing; DB-backed `AdminSession` rows |
| CSRF + Origin protection on all admin mutations and reads | Done (2 real bugs fixed) | See `verification.md` §4 — admin frontend GET-CSRF bug and backend Origin-vs-Referer bug both found via real browser testing and fixed |
| Draft CRUD, explicit publish/unpublish, publish validation | Done | Full lifecycle exercised live: create → edit → publish → public visible → unpublish → public 404, all in `verification.md` §3 |
| Category/author CRUD + referential delete protection | Done (1 real bug fixed) | Referenced-row delete silently "succeeded" without deleting (missing `db.flush()`); fixed and reverified against real PostgreSQL |
| Media upload/list/delete + referenced-protection | Done | Real Cloudinary SDK upload path; Pillow signature/dimension validation; Bruno covers invalid-file/no-URL-upload/delete-protection |
| Allowlisted structured rich-text editor and safe rendering | Done | Real block editor in admin (`admin-editor2.png`); public renderer allowlists node types, no raw HTML |
| Approved v2 homepage, listing, article, about (exact CSS) | Done | CSS extracted verbatim from approved Doop frames; homepage/article/listing screenshots in `docs/verification-shots/` |
| Native GET category filter, 9/page pagination, state preservation | Done | Verified via direct `curl` query-string requests, correct filtered counts |
| Public SEO (title/description/canonical/OG/JSON-LD), dynamic sitemap | Done | Verified in initial HTML via `curl`; sitemap contains only published URLs with real `lastmod` |
| Public 404/503/image-failure states | Done | Real 404 (unknown slug/category) and real 503 (backend stopped) both exercised and screenshotted/curled |
| Real Cloudinary assets, 5 published + 1 draft seed, 3 categories, 1 author | Done | `seed/assets-manifest.json` has real `secureUrl`s (HTTP 200-verified live); `scripts/seed.py` idempotent, uses the real service layer |
| Real Gemini generation: countTokens, structured output, limits, zero-retry | Done | Live model `gemini-3.5-flash-lite` confirmed via API; real generation exercised through the browser UI; invalid-length output correctly rejected without auto-retry |
| Persistent atomic daily quota + fenced global lease | Done | Quota counter observed advancing 2→3 live in the UI; reservation-before-provider-call architecture in `services/editorial.py`, unit-tested |
| Validated-result cache (7-day TTL) + idempotent generate | Done | Live cache-hit observed in Bruno and via real browser replay (same input → `cacheHit: true`, quota unchanged) |
| Draft-only atomic apply, selected-field-only, conflict (409), replay | Done (1 real bug fixed) | Idempotent-replay-after-apply bug found and fixed (§2 `verification.md`); conflict/ownership/selected-field-only all Bruno- and pytest-covered |
| All Assistant UI states (unselected/ready/generating/valid/cached/applying/applied/errors) | Done | Live pending state captured mid-generation (`admin-assistant-generated.png`); every distinct error code mapped to guidance text in `api.tsx` |
| Protected MCP server, exactly 5 allowlisted tools, key on every request | Done (1 real bug fixed) | Session-manager lifespan bug found and fixed; verified live: missing/wrong key → 401 before any tool runs, valid key → real `initialize`/`tools/list` returning exactly `list_drafts/read_draft/generate_metadata/apply_metadata/read_usage` |
| Bruno primary acceptance suite | Done | **86/86 requests, 145/145 tests, 120/120 assertions**, executed against the real app + real isolated PostgreSQL + deterministic Gemini test-double |
| Backend pytest (PRD T-01..T-20-equivalent) | Done | **7/7 passed** against real isolated PostgreSQL |
| CI workflow (typecheck, build, pytest, Bruno) | Written, locally equivalent-verified | `.github/workflows/ci.yml`; every step reproduced locally with identical commands/results (this document + `verification.md` §1–2); not yet executed inside actual GitHub Actions (no push to a GitHub remote performed) |
| Orca browser verification | Done, with one named, documented tooling limitation | Real login/CRUD/Assistant/404/503 flows exercised and screenshotted; 360/390/768px multi-viewport capture blocked by a reproduced Orca device-emulation limitation in this environment — documented in `verification.md` §6, not simulated or claimed |
| Keyboard/focus/labels | Partially verified | Tab-order/focus-visible CSS confirmed present and functioning on the login screen screenshot; snapshot-based focused-element detection was not available via the loaded Orca command set |
| JavaScript-disabled reading/filtering | Done (complementary check) | All public reading/filtering verified via `curl` (no JS engine involved at all), which is a stronger guarantee than a browser JS-disabled toggle; see `verification.md` §7 for why the toggle control itself was not found in Orca's loaded reference |
| Restart persistence | Done | Backend killed and restarted; all content/media intact on next request |
| README, architecture, operations, deployment, demo-script docs | Done | All written; `architecture.md` documents the Strapi→FastAPI mapping, draft/published structural design, auth/CSRF/MCP boundaries, AI safeguards, Neon portability, Cloudinary ownership |
| Content/license sources documented | Done | `docs/content-sources.md`: real Pexels photographer/license/source-page records for all 5 seed images |

## 2. Genuinely unresolved external prerequisites

These three are the only remaining blockers to a live production deployment, and none can be resolved from within this session:

1. **FastAPI Cloud.** `fastapi cloud login`/`whoami` require an interactive browser OAuth flow against an account this session has no credentials for (`uv run fastapi cloud whoami` → `No credentials found`). No backend deployment has been attempted or claimed.
2. **Astro SSR hosting.** No owner-approved Node-compatible hosting target or account was supplied. A portable, standalone `@astrojs/node` build and `Dockerfile` exist and are build-verified (§1), but no host has been chosen or provisioned.
3. **Neon.** No production/direct PostgreSQL connection string was supplied in the parent environment. Local PostgreSQL 18.3 is used throughout development and all testing; the schema/data-access layer is portable (plain SQLAlchemy async + Alembic, no Postgres-specific extensions beyond standard FK constraints and JSONB), so moving to Neon is a configuration change plus a documented migration/backup step once credentials are supplied — not a code change.

No paid resource was provisioned, no billing was enabled, and no account was created to work around these gaps.

## 3. Honest completeness statement

Every P0 item in PRD §5.1 and IMPLEMENTATION_PROMPT.md §§1–17 that does not require one of the three external prerequisites above has been implemented and independently verified against real running services — not mocked, not simulated, not claimed without observation. Six genuine application bugs were found during this verification pass (four backend, two frontend/backend-boundary) and fixed; all are documented with before/after evidence in `verification.md`. The one tooling limitation encountered (Orca multi-viewport screenshot capture) is named precisely rather than worked around with a fabricated result.

If deployment access is supplied, the remaining work is: authenticate `fastapi cloud login`, run `fastapi deploy`; choose and authenticate an Astro host and deploy the existing `apps/web/Dockerfile`/standalone build; supply Neon connection strings, run `alembic upgrade head` against them, and execute the documented seed/bootstrap steps. No further code changes are anticipated for that transition.
