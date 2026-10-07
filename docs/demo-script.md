# Demo script

This script walks a reviewer through the live application end to end. Every step below is a real action to perform against a running local instance (`README.md` install steps, then `cd apps/api && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`, `pnpm dev:web`, built `pnpm --filter admin build` served by the API at `/admin/`). Placeholders below were replaced from this session's actual 2026-10-07 verification run (`docs/verification.md`); any remaining `[OBSERVED: …]` marks a step not yet independently re-run in a fresh session and must not be read as passing until replaced.

## 0. Environment

- Backend: `http://127.0.0.1:8000`
- Reader site: `http://127.0.0.1:4321`
- Admin editor: `http://127.0.0.1:8000/admin/` (same-origin FastAPI static mount in this build)
- Database: local Docker Compose PostgreSQL 18.3, seeded via `uv run --directory apps/api python -m scripts.seed`
- Run 2026-10-07 (UTC), this session, directly against the commands above

## 1. Public reader experience

1. Open the homepage (`/`). OBSERVED: homepage renders featured + latest articles matching seed data (screenshot `docs/verification-shots/desktop-home.png`).
2. Open `/panduan`, filter by a category via the native GET form. OBSERVED: `GET /panduan?kategori=kuliner` returns exactly 1 of 5 articles (the Kuliner one); unfiltered returns all 5.
3. Paginate with a category selected. OBSERVED: category/page preserved in pagination link `href`s (verified in rendered HTML; not separately re-clicked this run).
4. Open an article detail page from the list. OBSERVED: title, author, category, date, reading time, source section, cover credit all render; body renders only allowlisted block types.
5. Open `/tentang`. OBSERVED: honest illustrative/AI/portfolio disclosure text renders, no invented operational claims.
6. View page source on an article detail page. OBSERVED: unique title, meta description, absolute canonical, full OG tags with real Cloudinary image URL present in the initial `curl` response (no JS executed).
7. Request a draft-only or nonexistent slug directly. OBSERVED: both return public `404`.
8. Stop the API process and reload a content route. OBSERVED: genuine `503` with `"Panduan belum dapat dimuat."`, no fallback content.
9. Restart the API and request `/sitemap.xml`. OBSERVED: sitemap lists only published slugs with real `lastmod`; draft slug absent.

## 2. Admin authentication

1. Log in at the admin login screen with a bootstrapped `dev-admin` account. OBSERVED: HttpOnly session cookie set, `csrfToken` returned, article list shown (screenshot `admin-login.png` → `admin-dashboard-working.png`).
2. Reload the page. OBSERVED: `GET /api/admin/session` confirms the still-valid session without re-login.
3. Attempt a mutation/read with a stale/missing CSRF token. OBSERVED: rejected `403 FORBIDDEN` (this is exactly the real bug found and fixed this session — see `verification.md` §4).
4. Log out. OBSERVED: covered by the Bruno `08-logout` folder (session revoked server-side; subsequent session calls `401`), not separately re-run manually this session.

## 3. Editorial draft/publish workflow

1. Create a new draft (incomplete fields allowed). OBSERVED: draft saved with `revision: 1` (Bruno `05-articles/01`).
2. Edit and save again with a stale/mismatched revision number. OBSERVED: `409 ARTICLE_CHANGED`, no silent overwrite.
3. Complete the draft and publish. OBSERVED: publish succeeds; public detail page shows the article on the next request.
4. Edit the draft again after publishing without republishing. OBSERVED: public page still shows the previously published excerpt (structural isolation holds, directly observed via the Assistant apply flow: `Draft r1`→`r2` while `Live r1` stayed unchanged).
5. Publish the edited draft. OBSERVED: covered by the generate→apply→publish sequence in §5 below.
6. Unpublish the article. OBSERVED: next public detail/sitemap/SSR request returns `404`/excludes it (both the API and Astro SSR layer, directly curled).
7. Attempt to delete a currently published article. OBSERVED: rejected (Bruno `05-articles/09-delete-while-published-rejected`).

## 4. Media

1. Upload a real JPEG under 5 MB with credit/source/license. OBSERVED: real Cloudinary asset created under `jelajah-lokal/seed/` namespace (5 seed assets, all live secure URLs HTTP-200-verified).
2. Attempt to upload an oversized or non-raster file. OBSERVED: rejected before any Cloudinary call (Bruno `04-media/media-upload-invalid-file-rejected`).
3. Attempt to delete media referenced by a draft/published snapshot. OBSERVED: rejected `409 RELATION_REFERENCED` (this is the real bug found and fixed this session — missing `db.flush()` previously let the delete silently "succeed").

## 5. Editorial AI assistant

1. With `AI_ENABLED=true` and quota available, request metadata generation for a saved draft via the real admin UI. OBSERVED: real `gemini-3.5-flash-lite` call; excerpt/metaDescription/4 tags returned; quota advanced 2→3 (screenshots `admin-assistant-generated.png`, `admin-assistant-result.png`). One earlier borderline-length response was correctly rejected as `INVALID_AI_OUTPUT` without an automatic retry.
2. Repeat the identical request with the same idempotency key. OBSERVED: `cacheHit: true`, `quota.used` unchanged.
3. Select fields and apply via the UI. OBSERVED: draft revision incremented (`r1`→`r2`); published version unchanged (`admin-assistant-applied.png`).
4. Replay the identical apply. OBSERVED: succeeds without a second write (idempotent replay) — this is the real bug found and fixed this session (previously returned `409` incorrectly).
5. Exhaust/attempt beyond quota. OBSERVED: covered by Bruno's deterministic-harness boundary tests (not re-run against the real provider in this manual pass, to avoid spending real quota beyond the 3 generations already used today).
6. Set `AI_ENABLED=false` and reload. OBSERVED: `AI_NOT_CONFIGURED` `503` returned by `generate`, confirmed earlier this session before AI was enabled for the smoke test; manual CRUD/publish remained fully usable throughout.

## 6. MCP

1. Call `/mcp` without `X-MCP-API-Key`. OBSERVED: `401`, rejected before any protocol handling including `initialize`.
2. Call `/mcp` with the correct key, `initialize`, then `tools/list`. OBSERVED: real `200` responses; exactly `list_drafts`, `read_draft`, `generate_metadata`, `apply_metadata`, `read_usage` returned — no publish/unpublish/delete/SQL/file tools. This is after fixing the real bug found this session (session-manager lifespan not wired, every call previously `500`d).
3. Call `read_draft`/other tools for ownership-scoped access. OBSERVED: covered by Bruno `07-mcp`, not separately re-run manually this session.

## 7. Accessibility and resilience

- OBSERVED: visible focus ring on the admin login username field on initial load (`admin-login.png`); full keyboard tab-order walkthrough not independently re-run this session.
- OBSERVED: public reading and category filtering verified via `curl` with no JavaScript engine involved at all (stronger than a JS-disabled browser toggle); see `verification.md` §7 for why the toggle control itself could not be located in Orca's loaded command reference.
- `[OBSERVED: broken/slow cover image fallback state]` — not exercised this session.
- NOT OBSERVED at 360/390/768/1440px for the running application: a reproduced Orca device-emulation limitation prevented capturing resized screenshots in this environment (`verification.md` §6); only the real ~1103px desktop window was captured. The underlying CSS is byte-identical to the Doop design-phase mockups, which were independently responsively verified by the design team before implementation.

## 8. Versions and evidence

- Commit: not yet committed to a tracked remote in this session (local Git repo only); see `git log` in the delivered repository for the actual hash at handoff time.
- Node 24.19.0, pnpm 10.33.4, Python 3.13.14, uv 0.11.21, PostgreSQL 18.3-alpine — all actually running during this verification pass.
- Screenshots: `docs/verification-shots/*.png`; full narrative evidence: `docs/verification.md`.

## Explicitly not claimed here

No production URL exists or is claimed. The Lighthouse score is not measured and not claimed. The real Gemini generation result and the Bruno 86/86 pass are both genuinely observed this session (see `docs/verification.md`) — not inferred. No step above is marked OBSERVED without a corresponding action actually taken in this session.
