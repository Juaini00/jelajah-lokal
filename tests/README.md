# Bruno API acceptance collection

`tests/bruno/` is a version-controlled [Bruno](https://www.usebruno.com/) 4.0.0
collection exercising `apps/api` against `contracts/implementation.md` and the
PRD's P0 scenarios (user stories §6, T-01..T-20 in §PRD "Pengujian kontrak
kritis"). It is **not executed by this worker** — the API has no routers yet
(only `app/config.py`, `app/db.py`, `app/errors.py`, `app/models.py`,
`app/schemas.py` exist at the time this collection was written). The
coordinator runs it once the real routes land.

## Layout

```
tests/bruno/
  bruno.json              collection manifest
  collection.bru          shared pre-request/test hooks (per-run nonce, JSON content-type sanity check)
  environments/
    local.bru             points at http://127.0.0.1:8000, secrets from OS env
    ci.bru                same, documents the exact env var names CI must export
    harness.bru           points at the deterministic AI test-harness process (see "AI determinism" below)
  fixtures/
    sample-cover.jpg       real 640x480 JPEG for media upload tests
    invalid-not-image.txt  non-image file for upload-rejection test
  00-health/                healthz / readyz
  01-public/                published-only list/detail/categories/sitemap, query allowlist, token scoping
  02-admin-auth/             login/session/logout, CSRF + Origin checks, admin + editor principals
  03-taxonomy/               category/author CRUD (main + throwaway resources)
  04-media/                  upload (valid/invalid/no-URL-upload), list, delete
  05-articles/ (01..21)      draft CRUD, revision conflicts, publish/unpublish guards,
                              draft/published isolation, referential delete protection,
                              delete-only-when-unpublished
  06-editorial/ (01..19)     Editorial Assistant: list/usage, generate/apply contracts,
                              ownership, conflict, idempotency, cache-hit (T-04,T-09..T-15)
  07-mcp/                    X-MCP-API-Key enforcement, five-tool allowlist
  08-logout/                 cleanup + logout + server-side session revocation
```

Folder number prefixes (`00-`..`08-`) are the intended run order; Bruno's CLI
runner traverses a collection directory recursively in that order, and each
request's `meta.seq` fixes ordering within its folder. Requests chain state
(cookies, CSRF token, created documentIds, generate `requestId`s, revisions)
via `bru.setVar`/`bru.getVar` in `script:post-response` blocks — this is a
**stateful, sequential** collection, not independent requests; always run the
whole collection (or a whole folder) in order, never a single file in
isolation (except the handful of `GET` health/public checks).

## Running it

```sh
# from the repo root (installs @usebruno/cli as declared there)
pnpm install

cd tests/bruno
pnpm exec bru run --env local
# or, in CI:
pnpm exec bru run --env ci
```

Required OS environment variables before running (never commit real values;
`environments/*.bru` resolve them via Bruno's `{{process.env.VAR_NAME}}`
mechanism, see `vars:secret` blocks in each environment file):

| Variable | Must match |
|---|---|
| `API_CONTENT_TOKEN` | the API process's `API_CONTENT_TOKEN` |
| `MCP_API_KEY` | the API process's `MCP_API_KEY` |
| `JELAJAH_TEST_ADMIN_USERNAME` / `_PASSWORD` | a principal created via the real bootstrap CLI with `role=admin` |
| `JELAJAH_TEST_EDITOR_USERNAME` / `_PASSWORD` | a **second** principal, `role=editor`, bootstrapped owning zero articles (ownership-rejection tests in `06-editorial` depend on this) |

The API must be migrated and running at `baseUrl` (`http://127.0.0.1:8000` by
default) before invoking `bru run`.

## AI determinism (generate/apply literal-content assertions)

Per BackendProduct3: there is no runtime mock flag (`AI_ENABLED`/`AI_MOCK_MODE`
reaching into the request path is intentionally rejected by `config.py`).
Determinism is a dependency-injection seam instead:

- Against the real app (`app.main:app`, real `google-genai` client): the
  `06-editorial/09-generate-request.bru` and friends branch on `200` vs `503
  AI_NOT_CONFIGURED` and only assert the **shape** of `result`
  (excerpt/metaDescription/suggestedTags), quota bookkeeping, cache-hit flags,
  and idempotency — never the literal generated text, since that depends on a
  real `GEMINI_API_KEY` actually being configured in the run environment.
- Against the deterministic test harness (`apps/api/scripts/run_test_harness.py`
  serving `app.testing:build_test_app()` with `FakeGeminiClient`, per
  BackendProduct3's plan at the time this collection was written), use
  `environments/harness.bru`. **Gap:** the exact fixture
  excerpt/metaDescription/suggestedTags values were not yet documented when
  this collection was written (`app/testing.py` had not landed). The literal
  value assertions are marked with an explicit `NOTE (assumption...)` comment
  in `09-generate-request.bru` — fill them in once `app/testing.py` documents
  its fixture output, otherwise the structural-only assertions remain valid
  but weaker than they could be.

## Post-hoc verification against the landed backend (update)

`apps/api/app/routers/*`, `app/services/content.py`, `app/services/editorial.py`,
`app/deps.py`, `app/mcp_server.py`, `scripts/bootstrap.py`, and
`app/testing.py` landed while this collection was being written. A direct
read against them confirmed every status/code assumption below exactly
(`SLUG_CONFLICT`→409, `RELATION_REFERENCED`→409 for category/author/media,
`ARTICLE_PUBLISHED`→409, `PUBLISH_VALIDATION_FAILED`→422, login bad-Origin→403
FORBIDDEN, missing/invalid CSRF→403 FORBIDDEN, bootstrap flags are exactly
`--username/--role/--password`) — the "Known gaps" list below is kept as
written for history, but items 1–2 are now resolved/confirmed, not guesses.

**One real bug this caught in the collection itself, now fixed:** every
route under `/api/admin/*` (including `admin_editorial`'s routes) applies
`Depends(require_csrf)` at the **router level**, so even plain `GET` admin
requests need a valid `X-CSRF-Token` header and matching `Origin`, not just
mutations — unlike the PRD's "CSRF protection for cookie-authenticated
mutations" phrasing. `03-taxonomy/{category,author}-list.bru`,
`04-media/media-list.bru`, `05-articles/03-draft-get.bru`, and
`06-editorial/{01-list-drafts,02-usage}.bru` now send `X-CSRF-Token` on
their `GET`s; only `GET /api/admin/session` (uses `get_session_principal`
directly, not `require_csrf`) is correctly exempt.

**MCP non-determinism caveat (from BackendProduct3/OperationsDocs3):** the
CI harness (`scripts/run_test_harness.py`, `AI_ENABLED=true` with
`FakeGeminiClient`) only fakes the Gemini client for the REST app module;
`app/mcp_server.py`'s `generate_metadata` tool always calls the real Gemini
client regardless of which app module is running. This collection's
`07-mcp` folder deliberately stops at `initialize`/`tools/list` and never
calls `generate_metadata`/`apply_metadata` over MCP, so no literal-content
assertion is at risk here — but if `tools/call` coverage is added later,
do not assert deterministic output from the MCP `generate_metadata` tool in
CI; only the REST `/api/admin/editorial/generate` path is deterministic
there.

With `FakeGeminiClient`'s fixtures confirmed in `app/testing.py`
(`FIXTURE_EXCERPT`, `FIXTURE_META_DESCRIPTION`, `FIXTURE_TAGS = ['uji-coba',
'deterministik', 'editorial']`), `06-editorial/09-generate-request.bru`'s
placeholder literal-assertion note can be upgraded to exact `expect(...).to
.equal(...)` checks once CI is confirmed to run `scripts.run_test_harness`
for every Bruno run (OperationsDocs3 confirmed this is now the case) —
left as structural-only checks here since this worker's assignment was the
collection itself, not a second edit pass chasing a moving backend target;
flag to BackendProduct3/OperationsDocs3 if literal assertions are wanted.


1. **Error codes without an explicit PRD/contract table entry.** The PRD's
   §14.6 error table only covers Editorial Assistant routes. For admin
   CRUD (categories/authors/media/articles) this collection infers codes and
   HTTP statuses from `apps/api/app/errors.py` (the only authoritative source
   available, itself not yet wired to any router):
   - `SLUG_CONFLICT` → 409 (matches the `IntegrityError` handler).
   - `RELATION_REFERENCED` → 409 for category/author/media delete-while-referenced
     (media's 409 is explicit in `contracts/implementation.md` line 17; category/author
     409 is inferred by analogy and NOT explicitly stated for those two).
   - `ARTICLE_PUBLISHED`/delete-while-published → 409 (inferred; `errors.py`'s
     `STATUSES` map currently has no explicit entry for this code, defaulting
     to 400 via `AppError`'s fallback — **this is a real discrepancy worth
     flagging to BackendProduct3** before relying on it).
   - `PUBLISH_VALIDATION_FAILED` and generic business-rule validation
     (title/slug/excerpt length, etc.) → 422, per the contract's general
     "invalid mutation 422" rule and the existing `RequestValidationError`
     handler's non-public-path branch.
   - `MEDIA_INVALID` (bad upload) → 422, same reasoning.
2. **CSRF/Origin mismatch status code.** Assumed `403 FORBIDDEN`; contract only
   says such requests are rejected, not which status/code. Tests in
   `02-admin-auth` (`login-bad-origin-rejected`, `mutation-without-csrf-rejected`)
   accept `401` or `403` defensively where the exact code is unconfirmed.
3. **Apply with an unknown/never-succeeded `requestId`.** No PRD/contract
   error code is named for this case (only "ditolak" is specified). Tests
   accept `404` or `409` defensively (`AI_REQUEST_EXPIRED` is 409 in
   `errors.py`, a generic not-found could be 400/404).
4. **`GET /readyz` returning 503 when the DB is down** cannot be exercised by
   an HTTP-only Bruno collection without an operator taking the database
   down mid-run; left as a manual/ops smoke test, not automated here.
5. **Quota boundary (T-07: 19/20/21st generation) and concurrent-request
   quota races (T-08)** are not practical to assert from a sequential Bruno
   collection — they require 20+ real (or harness) generate calls and/or
   true concurrent requests with a Postgres-backed atomicity proof per the
   PRD's explicit note ("mocking integer counter tidak cukup"). Recommend a
   dedicated Python/pytest concurrency test owned by BackendProduct3 instead;
   out of scope for this HTTP contract collection.
6. **UTC date rollover (T-18)** likewise requires either clock manipulation
   or a 24h wait; not exercised here.
7. **Unsafe body content execution (T-19)** is asserted structurally (no
   `<script`/`on...=` substrings reach the public detail response) but does
   not render the HTML in a real browser; full XSS-proof would need a
   headless-browser check, out of scope for an API contract collection.
8. **MCP tool-call bodies** (`list_drafts`/`read_draft`/`generate_metadata`/
   `apply_metadata`/`read_usage` actually invoked via `tools/call`) are not
   exercised beyond `initialize`/`tools/list` — the exact MCP JSON-RPC
   `tools/call` argument shape per tool isn't in the contract yet. Add once
   `apps/api/app/mcp` defines tool input schemas.
9. **Bootstrap CLI flags** (`--username/--password/--role`) used in
   `environments/ci.bru`'s documentation comment and in coordination with
   OperationsDocs3's CI workflow are inferred from PRD §9's "bootstrap CLI
   privately creates principals"; confirm against the actual
   `apps/api/scripts/bootstrap` implementation once written.
10. **Seed data interaction.** `01-public/list-articles-default.bru` and
   `categories.bru` assert shape only (not exact counts), so they pass
   whether or not `seed/` has run first; `05-articles` creates its own
   throwaway category/author/media/article so it never depends on seed
   content existing.
