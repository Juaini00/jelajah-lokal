# Architecture

## Scope and source precedence

Jelajah Lokal is an Indonesian editorial travel-guide application: Astro SSR for readers, React for the private editor, FastAPI for content/authentication/editorial/MCP, PostgreSQL for persistence, Cloudinary for raster media, and the official Google Gemini SDK for metadata suggestions. There is no Strapi runtime, reader chatbot, public registration, autonomous publication, or paid-provider fallback.

The owner's updated FastAPI architecture in PRD sections 9 and 29.1 and `IMPLEMENTATION_PROMPT.md` supersedes historical Strapi terminology. `contracts/implementation.md` freezes the API/body/authentication boundary. Generated `contracts/api.d.ts` comes from the backend OpenAPI document; it is not an independent schema. Engineering documents are English; application copy is Indonesian. Actual execution evidence belongs in `verification.md`, not in architectural claims.

## Concrete legacy-to-FastAPI mapping

| Legacy PRD concept | Current implementation boundary |
| --- | --- |
| Strapi Content Manager | React admin under `/admin/`; authenticated `/api/admin/articles`, categories, authors, and media routes |
| Document Service / stable document IDs | Shared SQLAlchemy content services and UUID `documentId`; camelCase REST DTOs validated by Pydantic |
| Draft & Publish / native publish button | Mutable saved draft plus structural published snapshot; explicit revision-checked `POST .../publish` and `.../unpublish` |
| Strapi administrator/editor roles | Private principals with Argon2 password hashes; revocable server-side sessions; admin-all/editor-owned article permissions |
| Plugin Editorial Assistant | React review interface and `/api/admin/editorial/{articles,usage,generate,apply}` calling shared editorial services |
| Media Library | Authenticated multipart uploads, Cloudinary SDK, persisted media metadata and reference-protected deletion |
| Strapi frontend API token | Separate `API_CONTENT_TOKEN`, accepted only by the published-only `/api/public/*` read API |
| Plugin/service automation | Official MCP Streamable HTTP `/mcp`, protected on every protocol request, using the same service layer |

No native-Strapi claims or compatibility aliases are needed: callers use the FastAPI contract directly.

## Request flow and ownership

```text
Reader -> Astro server -> published-only FastAPI API -> PostgreSQL
Reader browser -> Cloudinary HTTPS delivery
Editor -> FastAPI-served /admin/ -> cookie-authenticated REST -> shared services
Authorized MCP client -> /mcp -> fixed service principal -> shared services
Editorial services -> persisted reservation/lease -> Gemini -> validated result
```

Astro holds the content read token on the server only. Its initial HTML contains titles, canonical/OG/Twitter metadata and escaped JSON-LD. All content routes are SSR and `no-store`; API outages produce genuine 503 pages instead of seed-fixture fallbacks. Public routes are `/`, `/panduan`, `/panduan/{slug}`, `/tentang`, `/sitemap.xml`, `/robots.txt`, and `/healthz`. Category filtering uses a native GET form and pagination preserves the category. Drafts never enter the dynamic sitemap.

The production admin is served by FastAPI so cookie mutations remain same-origin. A separate Vite development server uses its API proxy; it is not a production hosting boundary. Public author profiles are independent of private login identities.

## Structural publication isolation

An article has a mutable draft revision and a separately stored published representation. The published snapshot contains title, slug, blocks, excerpt, SEO, tags, source information, public timestamps, and resolved category/author/cover values. It is not just a `publishedAt` flag over mutable draft fields. Later edits to draft, taxonomy, author, media associations, or AI metadata cannot leak into the live representation.

Draft creation permits incomplete writing. Save accepts the expected revision and rejects stale writes with `409 ARTICLE_CHANGED`. Publish locks/validates the complete current draft and atomically replaces the snapshot; required relations, safe cover, alt text, >=150 meaningful words, and field limits must pass. Published slugs cannot change in P0. Operational claims require a genuinely checked date; sample content must not fabricate one. Unpublish removes the snapshot's public visibility on the next fresh list/detail/sitemap request. Draft-only/nonexistent slugs return the same public 404. Only unpublished articles may be deleted. Relations referenced by either a draft or a snapshot remain protected from deletion.

## Rich-block API (body schema version 1)

`body` is a structured `Block[]`, not arbitrary HTML. Text inlines are `{type:"text",text,bold?,italic?}`; links are `{type:"link",url,children:TextInline[]}`. Blocks are paragraph, heading (level 2 or 3), quote, ordered/unordered list (`items:Inline[][]`), and image (`mediaDocumentId`, `alt`, optional `caption`). Public detail image blocks additionally resolve safe media values for rendering.

Only HTTP(S) links without credentials are allowed. No executable markup, raw HTML, arbitrary upload URL, or browser-supplied Cloudinary credential is accepted. Body text is limited to 20,000 Unicode code points. Frontend text rendering and metadata/JSON-LD escaping are still necessary: schema validation is not permission to inject HTML. Source links contain a label, URL and nullable real access date. The complete DTOs and field lengths are in the frozen contract and backend OpenAPI.

Public articles support `page` (1–1000), `pageSize` (1–12), category slug and featured filter; unknown query parameters are rejected with 400. Lists sort by publication time descending, then document ID. Public DTOs omit ownership, private account data, draft revisions and editorial history. The error envelope is `{error:{code,message,requestId,retryable}}`; malformed mutations return 422 and revision conflicts 409.

## Authentication and authorization boundaries

| Credential | Accepted use | Explicitly not accepted |
| --- | --- | --- |
| `API_CONTENT_TOKEN` bearer token | Published public API, from Astro's server | Private drafts, admin mutations, media uploads, editorial requests, MCP |
| Opaque HttpOnly session cookie | Private REST with current principal/role permissions | MCP identity or browser-stored long-lived credentials |
| Session-bound `X-CSRF-Token` | Every `/api/admin/articles`, `/api/admin/categories`, `/api/admin/authors`, `/api/admin/media` and `/api/admin/editorial/*` request — enforced router-wide, including plain `GET` reads, not only mutations — plus `POST /api/admin/logout`, all with an approved `Origin` | Replacement for session authentication; `POST /api/admin/login` and `GET /api/admin/session` (no session/CSRF token exists yet or is only being read) |
| `MCP_API_KEY` in `X-MCP-API-Key` | Every `/mcp` request, including initialize/discovery | REST login/publication, caller-selected roles |
| Cloudinary/Gemini/database/session secrets | Backend or provider secret stores | Public-prefixed env values, frontend bundles, logs or screenshots |

Login requires an explicitly allowed origin; `GET /api/admin/session` only requires the session cookie, since it is how a client first learns its `csrfToken`. Every other `/api/admin/*` request — including plain `GET` list/detail reads under articles, categories, authors, media, and editorial, not only `POST`/`PATCH`/`DELETE` mutations — requires both an allowed exact origin and the session-bound `X-CSRF-Token`, enforced as a router-level dependency rather than per-mutation. Production/staging use HTTPS, `Secure`, `HttpOnly`, `SameSite=Strict` cookies and enforced expiry. Logout revokes the database session. Private bootstrap creates named admin/editor accounts; there is no seeded default administrator or public registration. Admin can access all articles; editors only their owned articles, with permitted taxonomy/media management. Permissions are checked by services as well as routes, including request ownership at apply time.

MCP exposes exactly `list_drafts`, `read_draft`, `generate_metadata`, `apply_metadata`, and `read_usage`. It has no publish, unpublish, delete, SQL, filesystem, environment, schema or secret tools. Key comparisons are constant-time and occur before protocol/tool handling. The shared key maps to one server-controlled admin-equivalent service principal. **All clients with that key share the same identity and editorial-request ownership; this does not provide per-agent attribution.** Use access-controlled key distribution and rotate deliberately; do not pretend client names establish independent principals.

## Persistent AI workflow and failure semantics

Generation reads saved draft state, not unsaved DOM content. Requests accept only article ID plus idempotency key. It generates excerpt, SEO description and suggested tags—not travel facts or article bodies—and never saves/publishes the article. Review permits editing and selecting individual fields before a separate apply action.

Guards persist in PostgreSQL: principal-scoped unique editorial request keys; provider/UTC-day quota rows; a singleton global lease; and validated cache entries keyed by normalized complete input, model, Indonesian language, prompt version and schema. Defaults bound generation to 20/day, one global generation, 2,000 full-input tokens, 500 output tokens, 30-second provider timeout, 60-second lease and seven-day cache TTL. Before reservation, validate at least 100 meaningful words and the 7,000-character precheck; the official token-count call includes instructions/schema. Never silently truncate.

Acquire the lease and reserve quota atomically, commit the running request before HTTP, and release using ownership/fencing so an old worker cannot release a new lease. No database transaction remains open during provider HTTP. A slot remains consumed when a call may have happened, including timeout, invalid response or crash. SDK/application generation retries and repair calls are disabled. Repeating a key cannot cause another provider call; incompatible reuse conflicts. An expired/unknown request is not automatically replayed. A new explicit action/key is required after ambiguous failure.

Cache hits consume no slot, but still require current permissions and a request owned by the current principal. Output must pass structure, lengths, safety and completeness checks; invalid/truncated output is rejected. Apply resolves article/fingerprint from the stored request, locks request plus draft, rechecks permissions and revision, and updates only selected metadata. Identical apply replay succeeds without a second write; incompatible replay or changed draft conflicts. Publication remains manual. `AI_ENABLED=false` leaves manual CMS/publication usable. `AI_MOCK_MODE` is not a runtime fallback; isolated tests inject explicit doubles and do not prove real Gemini integration.

## PostgreSQL/Neon portability

Local development uses an app-only persistent Docker PostgreSQL 18.3 service on loopback port 55438. Tests use a separate PostgreSQL database/server and must never target the development or production database. SQLAlchemy/Alembic preserve portable PostgreSQL schema and short request-scoped transactions. Database lease/quota rows do not depend on session locks, which would be unsafe behind transaction pooling.

Production `DATABASE_URL` is the Neon pooled application connection; `DATABASE_DIRECT_URL` is the direct migration/backup connection. Require TLS and preserve certificate verification when translating provider URLs for asyncpg. Explicit pool size/overflow limits must fit the approved Neon and FastAPI Cloud instance limits: maximum potential connections are approximately `instances × workers × (DB_POOL_SIZE + DB_MAX_OVERFLOW)`, plus migrations/backup/admin headroom. Defaults are five pooled plus five overflow per process, not a promise that autoscaling can open unlimited connections. Cold starts/reconnects may delay readiness; do not mask them with fixture data or mutate quota to compensate. See deployment and operations for the actual configuration/procedures.

## Cloudinary and content provenance

Persist media ID, owned public ID, asset ID, HTTPS delivery URL, dimensions, format, credit, source URL and license. Runtime uploads accept only real JPEG/PNG/WebP files <=5 MB, verified with Pillow rather than filename/MIME alone. No SVG or arbitrary-URL fetching endpoint exists. Deletion rejects draft/published references.

Seed preparation operates only on approved photography and stable owned IDs under `jelajah-lokal`; it checks ownership before reusing assets and never overwrites unrelated account assets. `seed/assets-manifest.json` and `docs/content-sources.md` retain provenance/license evidence. Uploading to Cloudinary does not transfer copyright or erase Pexels attribution/license obligations. Seed articles are disclosed illustrative content, not verified operational advice. Seed through shared publish validation, preserve user edits, and do not spend AI quota on bulk seed metadata.
