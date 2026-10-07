# Jelajah Lokal — Full-Stack Implementation and Orchestration Prompt

You are the primary implementation agent and integration owner for Jelajah Lokal. Build the complete P0 product from the supplied PRD and approved Doop designs: install and configure the actual frameworks, implement the frontend and backend, prepare real Cloudinary assets, seed PostgreSQL, implement the protected Gemini editorial workflow and application MCP server, verify the running application, and prepare and execute authorized deployment.

This is an implementation request, not a request for another proposal, a static mockup, or a scaffold. Remain the coordinating agent until the deliverable is complete. Use background subagents for independent work while retaining responsibility for integration, security, visual fidelity, and final evidence. Do not hand the project off and stop.

All engineering instructions and documentation you author must be in English. The application's public and editor-facing copy must remain in Indonesian, as required by the PRD. Indonesian names in the design references below are resource identifiers, not instructions to change the product language.

## 1. Sources of Truth and Conflict Resolution

Read the entire current `PRD.md`, the available repository instructions, `.env.example`, and the live Doop designs before changing application code. The PRD may have been updated after the original design session; do not rely on conversational memory or an earlier snapshot.

Apply this precedence:

1. The owner's latest explicit requirements: Astro, FastAPI, local PostgreSQL followed by Neon for production, Cloudinary media, Gemini metadata assistance, and the allowed implementation-agent models listed below.
2. The revised PRD architecture in sections 9 and 29.1. These explicitly replace Strapi with FastAPI and add the application MCP server.
3. The approved live Doop frames, including the homepage v2 cutover and the approved article-width comments.
4. The remaining PRD requirements and acceptance criteria, interpreted through the updated architecture.

Legacy references to Strapi, native Content Manager, Document Service, plugin routes, or native publish are historical terminology. Implement their functional equivalents in FastAPI and the custom editor UI. Do not install Strapi, add a second CMS, or let obsolete Strapi-specific requirements prevent implementation of the approved FastAPI architecture.

Preserve the behavioral contracts: private drafts, separate published content, deliberate manual publication, authenticated editorial actions, persistent AI safeguards, selected-field draft-only application, and conflict protection. Document the concrete legacy-to-FastAPI mapping in `docs/architecture.md`.

Implement all P0 requirements. “Full frontend and backend” means the complete agreed P0 product, including the custom editorial admin and MCP support; it does not authorize every P1/P2 roadmap feature. Do not silently reduce P0 to meet the old two-day estimate, which predates the custom-admin expansion.

## 2. Workspace and Repository Safety

The supplied personal workspace contains `PRD.md`, credential files, and an unrelated `slides/` repository. Unless a dedicated application repository already exists, create a dedicated `jelajah-lokal/` application directory beside these inputs. Do not put the application inside `slides/`, initialize Git at the personal-workspace root, or modify unrelated personal files.

Preserve all user changes. Inspect existing application code before scaffolding into an existing directory. Never reset a database, overwrite user content, force-push, delete unrelated files, or replace an existing project to simplify your task.

Suggested layout:

```text
jelajah-lokal/
  apps/
    web/                    # Astro + TypeScript public SSR frontend
    admin/                  # React + TypeScript editor UI; production build served by FastAPI
    api/
      app/
        core/               # configuration, authentication, database, safe logging
        models/
        schemas/
        services/           # shared content/editorial/media services
        routers/
          public/
          admin/
          editorial/
        mcp/
      alembic/
      scripts/
      tests/
      pyproject.toml
      uv.lock
      Dockerfile
  contracts/                # OpenAPI/schema snapshots and generated client types where useful
  tests/
    bruno/                  # Version-controlled Bruno API acceptance collection
      environments/         # Non-secret local/test/live environment templates
  seed/
    content/
    assets-manifest.json
  docs/
    PRD.md
    architecture.md
    design-reference.md
    implementation-status.md
    verification.md
    content-sources.md
    operations.md
    deployment.md
    demo-script.md
  infra/
    compose.yaml
  .github/workflows/ci.yml
  .env.example
  .gitignore
  README.md
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
```

Use simple workspace tooling. Prefer pnpm for JavaScript packages and uv for Python dependencies if available and compatible. Verify supported runtime versions from the official framework and hosting documentation, then pin Node, Python, dependencies, lockfiles, and container images. Do not guess future CLI flags, SDK methods, or hosting requirements.

Keep the original PRD as an input. Copy it into the application documentation and record current overrides in the architecture document without silently rewriting the owner's original document.

## 3. Agent Models and Orchestration Rules

Allowed model families:

- Qwen3.8 Flash.
- GLM 5.3.
- ChatGPT.
- Claude Sonnet-5.

The owner explicitly permits all four for this implementation. The previous restriction against GPT applied to the preceding design-revision task, not this implementation request.

Discover the exact available provider/model selectors and usable authentication in the current runtime. Catalog presence alone is not proof that a provider is authenticated. Do not substitute Sonnet 5.5 for Sonnet-5 or a different Qwen/GLM version without permission. Do not silently use a model outside the allowed list. If a selected model is unavailable, report that fact and select an available model from the owner's permitted list when permitted by the runtime; never misreport which model actually performed a task.

Recommended responsibilities, adjusted to actual availability:

| Responsibility | Preferred model |
|---|---|
| Primary coordinator, interfaces, integration, architectural decisions | ChatGPT or Sonnet-5 |
| FastAPI content/authentication, transactional editorial safeguards, MCP security | Sonnet-5 or ChatGPT |
| Astro public pages, responsive visual implementation, React editor interactions | Qwen3.8 Flash |
| Cloudinary asset preparation, deterministic seed fixtures, bounded infrastructure work | GLM 5.3 |
| Independent security/behavior review | Sonnet-5 or ChatGPT |

Do not spawn agents merely to use every model. Create a small number of substantial, independent work packages with explicit file ownership, inputs, contracts, and acceptance criteria. Resolve shared foundations before parallel editing. Assign one owner to migrations, shared schemas, generated clients, lockfiles, and cross-cutting configuration.

Before delegation, freeze the API paths, request/response DTOs, error envelope, body-block format, authentication boundary, stable identifiers, and media contract in repository files. Give workers those contracts plus the relevant PRD sections and design references; do not repeatedly paste the entire PRD into every follow-up message.

Every worker must:

- Stay within assigned files and avoid changing another worker's interfaces without coordination.
- Implement real functionality, not stubs, fake success, or permanent mock integrations.
- Report artifacts, blockers, and exercised evidence once at a meaningful checkpoint.
- Avoid repeated status polling and acknowledgment loops.
- Avoid competing migrations, lockfile updates, or formatting sweeps.
- Skip builds, lint, tests, and formatters mid-flight; the coordinator runs the integrated checks at appropriate integration gates.

Keep working on independent integration tasks while workers run. Wait only when genuinely blocked by a dependency. Do not end the overall task after a phase, delegation, or successful build.

## 4. Approved Doop Design Contract

Canvas: `https://doop.design/c/b8M1WUsvcm`

Discover the live canvas first. Read the Doop agent guide and applicable style guides before using the design tools. Fetch frame HTML and screenshots; do not reconstruct the designs from names alone. Read comments, including resolved comments when needed to understand approved changes. Treat new user feedback as authoritative.

Current frame references:

| Area | Frame IDs |
|---|---|
| Approved homepage desktop BASE, already replaced with v2 IMPROV | `zliQkEJkt6` |
| Preserved original v2 IMPROV reference | `vhp4cidHo2` |
| Homepage mobile reference | `cqr4vQtnfR` |
| Guide listing desktop/mobile/active category | `xP9-xjjjSU`, `ApoikWk924`, `XZt7FbMWvb` |
| Article desktop/mobile | `v39mQEt5xl`, `VhIRUxU2l2` |
| About desktop/mobile | `3_EujjNSK0`, `9G-OuPRZj-` |
| Editorial Assistant desktop/mobile/mobile quota failure | `eh2znmLUql`, `p_BNA3emIa`, `SaXQ39mrXz` |
| Listing/filter/pagination states | `En8lxk8JWC` |
| Article 404/503/image-failure states; mobile 404 | `zNVe4H24pc`, `gOfAFlGzGV` |
| Assistant workflow/error states | `5Gg5lEgwlj`, `4Iv2oaRbJU` |
| Design system and components | `6DMLtE908v` |

Relevant canvas guides include `jelajah-design-system`, `article-reading-width`, `editorial-assistant-native`, and `design-delivery-verification`. User-moved frame coordinates are not application requirements; discover them instead of restoring old positions.

Visual requirements:

- Use the approved v2 desktop homepage, including its italic pine-colored headline treatment and primary exploration action. Do not rebuild the old homepage BASE design.
- The separate homepage mobile frame predates the desktop-only v2 replacement. Implement responsive behavior consistent with the approved v2 desktop and use the mobile reference for spacing, hierarchy, and usability; do not revert to the old desktop to match it.
- Newsreader display typography and Manrope UI/body typography; use the actual approved styles and necessary weights/italic variants. Prefer legally self-hosted, optimized font files.
- Public palette: paper `#FAFAF7`, ink `#202A25`, muted `#626C64`, pine `#235940`, soft ground `#F0F2EC`, rule `#DCDFD8`, subject to the live approved guides.
- Desktop public content width approximately 1248px at 1440px viewport; tablet margins approximately 32px; mobile margins approximately 22px.
- Article hero, reading body, and source section share the approved 960px desktop column and the same left/right edges. Approved comments `bN52M--M` and `idcABpsI` supersede the old 720px reading measure. Keep all three responsive at smaller widths.
- Preserve editorial photography, restrained borders, clear type hierarchy, and modest radii. Do not introduce generic SaaS cards, gradients, glassmorphism, arbitrary illustrations, or new visual directions.
- An image-failure state means the published image cannot currently load; it does not permit publication without a required cover image.

The Assistant mockups originally used a Strapi shell. Preserve their useful layout, UI tokens, and workflow, but implement a real custom editor UI backed by FastAPI. Remove the Strapi logo, native-plugin claims, prototype scripts, fake quota values, mock publication dates, placeholder anchors, and simulated apply/cache behavior. Use Jelajah Lokal branding and real backend state. Do not install Strapi solely to reproduce a logo or shell.

Export relevant design inputs into `docs/design-reference.md` and durable project-local references. Do not depend on `local://` artifacts from an earlier agent session being available in a new session. Do not modify the live Doop designs unless the owner explicitly requests design changes.

## 5. Runtime Architecture

Implement:

```text
Public reader
  -> Astro SSR
     -> FastAPI published-only content API, using a server-only read token
        -> PostgreSQL

Editor
  -> React admin UI served by FastAPI
     -> authenticated FastAPI admin/content/editorial routes
        -> shared service layer + PostgreSQL
        -> Gemini for metadata generation only
        -> Cloudinary for media uploads and asset metadata

Authorized agent
  -> protected application MCP endpoint
     -> the same permission-aware content/editorial services
        -> the same quota, lease, cache, ownership, and conflict checks

Published image delivery
  -> Cloudinary HTTPS delivery URLs
```

Astro must not own Gemini credentials, access private drafts, or perform content mutations. The admin UI must call real FastAPI APIs, not manipulate database rows or read unsaved content from another form's DOM.

Build the React admin as a small, usable editorial application, not a separate large dashboard. Serve its production assets through FastAPI to retain a same-origin admin/API boundary and a straightforward FastAPI Cloud deployment. Keep the Astro public server independently deployable.

Use SQLAlchemy 2.x with an appropriate async PostgreSQL driver, Alembic migrations, and Pydantic v2 validation, after verifying version compatibility. Use the official Python `google-genai` SDK for backend Gemini calls and the official Cloudinary Python SDK for runtime uploads. Do not add unnecessary Redis, queues, vector stores, another backend, or AI orchestration frameworks.

## 6. Credentials, Configuration, and Preflight

The supplied `.env.example` currently lists:

```dotenv
GEMINI_MODEL=
GEMINI_API_KEY=
GEMINI_HEADER_AUTHORIZATION=
MCP_API_KEY=
CLOUDINARY_API_KEY=
CLOUDINARY_APY_SECRET=
CLOUDINARY_CLOUD_NAME=
```

The template is blank by design. The owner's private `.env` was observed to contain non-empty values for these entries; presence is not proof of API validity. Read credentials locally only when needed. Do not ask the owner to paste secrets into chat, print them, place them in task prompts, include them in screenshots, or commit them.

Normalize the misspelled Cloudinary key to `CLOUDINARY_API_SECRET` for the application template, private application environment, deployment configuration, and code. Preserve the supplied secret value. If both spellings exist with different values, stop that credential migration and ask privately which is authoritative without displaying either value. Do not retain a permanent fallback alias in application code. Do not delete or rewrite unrelated credentials in the parent workspace.

Reuse the supplied `MCP_API_KEY`; do not replace it because generating a new one is easier. Generate missing local application secrets with a cryptographically secure library and store them only in ignored private files or the deployment secret store.

Create a complete, safe application `.env.example`, separating public-server configuration, backend secrets, and optional production values. Include at least:

- `SITE_URL`, `API_URL`, `API_CONTENT_TOKEN`, `API_REQUEST_TIMEOUT_MS`.
- `ENVIRONMENT`, `API_PUBLIC_URL`, `DATABASE_URL`, `TEST_DATABASE_URL`.
- `DATABASE_DIRECT_URL` when a distinct direct connection is needed for production migrations/backups.
- `ADMIN_SESSION_SECRET` and the selected session/CSRF/origin settings.
- The supplied Gemini, MCP, and corrected Cloudinary variables.
- `AI_ENABLED`, `AI_MOCK_MODE`, `AI_DAILY_LIMIT`, `AI_MAX_INPUT_TOKENS`, `AI_MAX_OUTPUT_TOKENS`, `AI_TIMEOUT_MS`, `AI_CACHE_TTL_DAYS`, and `AI_PROMPT_VERSION`.
- Explicit allowed origins/media hosts and frontend/backend runtime settings as actually required.

Never use frontend-public prefixes for secrets. Browser code must receive neither the content read token nor Gemini, Cloudinary, MCP, database, or admin-signing secrets.

Determine the intended purpose of `GEMINI_HEADER_AUTHORIZATION` before using it. For the standard Gemini Developer API, use the supported official SDK/API-key mechanism. Do not blindly forward this header to Google, Cloudinary, or arbitrary hosts. If the supplied credentials require a custom Gemini gateway, obtain and verify its base URL and authentication semantics; do not invent an endpoint or silently switch providers.

Keep `.env` files, raw MCP configurations containing credential headers, private bootstrap credentials, and service-account files outside Git and public artifacts. Parent `.mcp.json` contains credential-bearing configuration and must not be copied into a tracked project file. Provide only a sanitized example configuration when needed.

## 7. PostgreSQL Locally, Neon for Production

Use real PostgreSQL throughout development and automated persistence/concurrency testing. Prefer a dedicated Docker Compose PostgreSQL service with an isolated persistent volume and a loopback-only local port when Docker is available. Do not use SQLite as a substitute for transactional tests. Do not alter other projects' containers, volumes, or databases.

Neon is managed PostgreSQL, not a different application database model. Keep the schema and data-access layer portable. Switching environments must primarily require configuration, compatible migrations, and a documented data transfer when existing local content needs to move.

For Neon:

- Verify the supplied connection strings, TLS requirements, SQLAlchemy/driver compatibility, and connection-pooling behavior.
- Use the appropriate pooled application connection and direct migration/backup connection where required.
- Keep transactions request-scoped and short; do not hold a PostgreSQL transaction open during a Gemini HTTP call.
- Use database-backed lease/quota rows rather than session-dependent locks that are incompatible with transaction pooling.
- Bound connection counts and document cold-start/reconnection behavior.
- Apply migrations to the intended database before seeding; validate that all services target the same environment.
- Back up before changing an existing production schema. Never reset production to demonstrate a migration.
- Prefer an isolated Neon development/staging branch for destructive tests when available. Never run the test suite against production.

Do not provision a second paid database through FastAPI Cloud when Neon is the approved target. Do not create a paid account, enable billing, or buy a service without explicit owner authorization.

## 8. Content Model and Draft/Published Isolation

Implement Article, Category, Author, SourceLink, MediaAsset, admin principals/sessions, EditorialRequest, DailyQuota, GlobalLease, and validated-result cache persistence.

Preserve stable public `documentId` identifiers, preferably UUIDs, and the PRD's public field names even though Strapi no longer supplies them.

Make draft/published separation structural, not just a boolean filter on a mutable row. A conservative design is an article identity, a current mutable draft with a monotonic revision, and an immutable published snapshot/revision selected by a published pointer. A comparably rigorous design is acceptable if its behavior is demonstrated.

Required invariants:

- New articles begin as drafts and may be incomplete.
- Saving or applying metadata to a draft never changes the live published representation.
- Public slug, title, body, metadata, cover association, and public modification dates come from the published representation, not the current draft.
- Publishing validates the complete draft and atomically updates the live snapshot/pointer.
- Unpublishing removes the article from public lists, detail responses, and the dynamic sitemap on the next request.
- Draft-only/nonexistent slugs return 404 without leaking private content.
- Public DTOs exclude admin identity, internal hashes, AI history, request ownership, and draft fields.
- Slugs are unique and validated. Avoid changing published slugs unless the owner accepts the documented consequences; redirects are not required P0.
- Categories/authors referenced by articles cannot be deleted without appropriate reassignment.
- Public authors are independent of private admin accounts.

Apply all PRD field limits and publish guards, including title length, minimum meaningful body words, excerpt/SEO/tag limits, category/author relations, required cover and alt text, safe source URLs, and checked dates when operational claims require them. Never fabricate verification dates.

Use one documented structured rich-text block schema end-to-end. Build a usable editor with the needed heading, paragraph, list, quote, link, and image capabilities. Render through an allowlist; reject executable HTML, unsafe URLs, scripts, and event handlers. Do not ship raw JSON editing as the only normal article-writing experience or support multiple competing body formats without a real need.

## 9. Authentication, Admin UI, and API Contracts

Implement a real private editor/admin login, logout, session expiration, and role/article permissions. Use maintained password-hashing/session libraries, secure password hashes, a revocable server-side session design, secure production cookies, explicit origin checks, and CSRF protection for cookie-authenticated mutations. Do not invent cryptography, expose a default production password, add public registration, or put long-lived admin credentials in localStorage.

Provide an explicit, secure bootstrap CLI for creating the initial administrator/editor. Development credentials may be generated privately for local verification, but must be clearly development-only and must not be embedded in seed data or shared in the final report.

The admin must support real article create/read/update/delete-draft, explicit publish/unpublish, category and author management, media upload/list/select, and Editorial Assistant review/application. Enforce permissions and validations on the server even when a control is hidden in the UI. Prevent deletion of referenced media and distinguish draft from live state clearly.

Keep public content routes compatible with PRD section 13:

- `GET /api/public/articles` with allowlisted page/pageSize/category/featured parameters.
- `GET /api/public/articles/{slug}`.
- `GET /api/public/categories`.
- `GET /api/public/sitemap-entries`.

Public SSR uses a separate read-only content token. It must be rejected by admin, draft, editorial, media-mutation, and MCP endpoints.

Define and document concrete FastAPI admin/content/media routes and preserve the Editorial Assistant contracts in PRD section 14, using a documented admin prefix if appropriate:

- List accessible saved drafts.
- Read usage/quota/busy state.
- Generate with `articleDocumentId` and `idempotencyKey` only.
- Apply with `requestId`, selected fields, and edited values.

Use the PRD's error envelope and meaningful status/code distinctions: authentication, permission, missing article, busy, revision conflict, idempotency conflict, input too long, invalid AI output, application quota, provider rate limit, not configured, quota storage unavailable, provider failure, and timeout. Do not collapse these into an unexplained generic error.

Freeze and publish the OpenAPI/schema contract and generate or validate TypeScript clients against it. Do not maintain unrelated handwritten DTO definitions that silently diverge between public frontend, admin UI, and backend.

## 10. Gemini Editorial Workflow and Persistent Safeguards

Implement metadata assistance, not autonomous article writing or publication.

The backend reads the saved draft from PostgreSQL after checking the caller's permissions. The client cannot supply arbitrary article bodies, prompts, model names, providers, or fetch URLs. Unsaved editor form changes are not part of the generation input; show the saved draft timestamp and source preview.

Use `GEMINI_MODEL` from verified configuration. Check model availability, free-tier eligibility, supported structured output/token-counting/thinking settings, and the installed SDK's actual behavior. Do not hardcode an unverified model or automatically switch to a paid model/provider.

Generate exactly one metadata package:

- `excerpt`: 50–240 Unicode code points.
- `metaDescription`: 70–160 Unicode code points.
- `suggestedTags`: 1–5 relevant tags, each 2–30 Unicode code points, unique case-insensitively.

Use only article-grounded information. Treat article text as untrusted data, not instructions. Do not add prices, locations, opening hours, safety claims, personal data, HTML, or external facts. Validate schema and safety after generation; reject invalid/truncated responses without an automatic repair call.

Hard safeguards:

- 20 provider generations per global UTC day by default.
- One global in-flight generation lease, stored in PostgreSQL.
- At most 2,000 total input tokens, including actual instructions/schema as counted for the selected model.
- At most 500 configured output tokens under the verified model's output/thinking semantics.
- A 7,000-character precheck, followed by the official token-count operation; never silently truncate articles.
- At least 100 meaningful input words.
- 30-second provider timeout, cancellation best effort, and zero automatic generation retries, including SDK retries.
- Valid-result cache TTL of 7 days, keyed by normalized input, model, language, prompt version, and schema version.

Acquire the global lease and reserve daily quota atomically. Commit the running request/reservation before calling Gemini. Use lease ownership/fencing so an expired worker cannot release a newer worker's lease. Reservations remain consumed after a provider call may have occurred, including timeout or invalid output. Local validation failure before reservation consumes no generation slot; valid cache hits consume none.

Persist idempotency and request states. A repeated key must not produce another provider call. The same key with incompatible request data must conflict. A crash after a possible provider call must not trigger automatic replay; mark the result unknown/expired and require an explicit new action if retrying.

A cache hit still requires current article permissions and an ownership-safe request record for the current caller. Do not expose another caller's request ID to bypass apply ownership checks.

The editor can review/edit/select fields and explicitly apply the result. Apply must:

- Resolve the target from the stored request, not trust a client-supplied target/fingerprint.
- Enforce ownership and current article permissions.
- Validate selected fields and values.
- Lock/conditionally update the draft and atomically compare its revision/fingerprint.
- Return 409 without overwriting if the article changed.
- Update only selected draft metadata, never title/slug/body or the published version.
- Persist an idempotent applied result; identical replay succeeds without duplicate mutation, changed replay conflicts.
- Never call Gemini or publish.

AI failure, disabled configuration, provider limits, and quota exhaustion must leave manual editing/publication available. Show live backend usage, not invented currency balances, credits, or mock counts.

## 11. Application MCP Server — Separate from Cloudinary MCP

Implement the application's own authenticated MCP server required by PRD section 9.5. This is distinct from the owner's external Cloudinary MCP configuration.

Use the supported official Python MCP SDK and a transport compatible with the actual FastAPI Cloud deployment, preferably protected Streamable HTTP mounted within the FastAPI service. Verify the SDK's lifecycle, origin/security settings, and hosting request limits instead of copying old transport examples.

Protect every MCP protocol request with the supplied `MCP_API_KEY`, including initialization and discovery. Reject missing/incorrect keys with 401 before tool execution. Use a documented header mechanism, constant-time secret comparison, and secret-safe logs. Never put the key in a query parameter, public browser bundle, or tool output.

P0 tools are limited to:

- List/read authorized drafts.
- Generate metadata.
- Apply reviewed/selected metadata to a draft.
- Read usage/quota/busy state.

Tool names may follow the SDK's conventions, but the documented allowlist is binding. Do not expose publish/unpublish, delete, migration/schema changes, environment reads/writes, arbitrary SQL/files, or secret retrieval. Do not combine generation, apply, and publication into one tool.

Map the shared key to an explicit server-controlled service principal with the approved admin-equivalent article access. Apply the same request ownership, validation, quota, lease, cache, and conflict rules as the admin API. Never accept a caller-controlled principal/role to impersonate an editor. Document the shared-key identity limitation rather than pretending there is per-agent attribution.

MCP tools must call the shared service layer, not duplicate or bypass it. The MCP credential must not authenticate unrelated admin REST publication routes. Add real MCP client smoke and negative authorization/allowlist tests.

## 12. Cloudinary Integration and Complete Asset Preparation

The owner configured `cloudinary-env-config` at:

`https://environment-config.mcp.cloudinary.com/mcp`

Its configured authentication uses `cloudinary-cloud-name`, `cloudinary-api-key`, and `cloudinary-api-secret` headers. Read actual values privately from the owner's configuration/environment; never print or commit them.

Official documentation distinguishes:

- Environment Config MCP: upload presets/mappings, named transformations, webhook notifications, and similar configuration.
- Asset Management MCP: asset upload, search, management, and related operations.

The Asset Management endpoint is `https://asset-management.mcp.cloudinary.com/mcp`. It may not yet be configured. Discover tools before assuming upload capabilities. Reload/reconnect the actual MCP client if the new configuration is not mounted. Do not claim a server is connected merely because its configuration exists.

Use available MCP tools for narrowly required environment configuration. Do not change account plans, billing, global security settings, or unrelated presets/assets. The official Cloudinary SDK/Upload API is an authorized real upload path when Asset Management MCP is absent; it is also required for application runtime uploads. Do not block complete seeding solely on an optional MCP server when the SDK can perform the needed operation with valid supplied credentials.

Prepare the actual image assets before publishing seed records. Start from approved Doop photography and its real source/license metadata. Existing reference photos include these Pexels IDs:

| Purpose | Pexels photo ID | Photographer recorded in the design |
|---|---|---|
| Featured rice terraces | `36810327` | Tom Fisk |
| Satay/culinary card | `37121687` | Noval Gani |
| Traditional village/culture card | `28881743` | TIORHISTA R |
| Rural path | `1846335` | Tom Fisk |
| Village landscape | `1547429` | Tom Fisk |

Obtain actual current source URLs from the live frames or verified asset search. Verify content type, image dimensions, license, and successful retrieval. Do not copy Cereal's copyrighted photography or invent stock-photo URLs. If an approved image is unavailable, choose a legal, visually comparable replacement and document the change; do not ship a placeholder.

Upload only required project assets into an app-owned namespace, such as `jelajah-lokal/seed/`, with stable public IDs and ownership checks. Persist secure delivery URLs, public/asset IDs, dimensions, formats, source URLs, credit, license information, and seed identity in `seed/assets-manifest.json` and the database.

Uploads and seeding must be repeatable without duplicate assets or overwriting unrelated account assets. Check existing owned IDs before upload. Do not enumerate, rename, delete, or bulk-transform the owner's entire Cloudinary account. Never generate paid imagery or enable paid add-ons without approval.

Implement authenticated media upload/list/select in FastAPI and the admin UI. Enforce the PRD's 5MB raster-image limit, verify actual file types, reject unsafe SVG uploads, and prevent arbitrary-URL fetches/SSRF. Protect deletion of referenced media. Do not expose private draft associations or private filenames in public DTOs.

Use optimized Cloudinary delivery URLs/srcset with fixed dimensions and correct alt text. Keep hero images eager and below-the-fold images lazy. Verify actual transformations and rendered crops. Rehosting does not remove source-license attribution requirements.

## 13. Complete and Idempotent Seeder

Deliver real seed content stored in PostgreSQL and real media hosted in Cloudinary:

- At least five published articles.
- At least three categories: Destinasi, Kuliner, and Budaya.
- At least one public author.
- At least one additional unpublished draft for security/editorial demonstrations.
- Meaningful article bodies meeting publish validation, with headings, paragraphs, lists, and source information where applicable.
- Valid manual excerpt/SEO/tags, required relations, Cloudinary cover assets, alt text, dimensions, and appropriate credits.

The region is not finalized. Until it is, use clearly labeled illustrative content consistent with the approved designs, not invented operational facts about the owner's location. For a public portfolio, generic inspiration content is acceptable when clearly disclosed. Do not fabricate prices, opening hours, factual verification, publication history, or source access dates.

Do not waste Gemini quota generating every seed article's metadata. Seed valid manually prepared metadata and reserve real Gemini generation for the explicit smoke/demo workflow.

Seed through the same validated service layer used by the application, including publication validation. Use stable slugs/identifiers and an asset manifest. Running the full seed twice must preserve existing user content and avoid duplicates. Do not reset the database, insert a default production admin password, bypass publish guards, or substitute runtime frontend fixtures for database-backed content.

After seeding, verify public API totals and associations, unpublished-draft exclusion, actual Cloudinary image responses, and the rendered website. “Seeder complete” includes the asset files and relationships, not just database rows containing nonfunctional URLs.

## 14. Public Frontend and Editor Experience

Implement the full public routes `/`, `/panduan`, `/panduan/{slug}`, `/tentang`, `/sitemap.xml`, `/robots.txt`, `/healthz`, and correct 404/503 responses.

Use Astro SSR for content and the sitemap. Published changes must appear on a fresh request without rebuilding the frontend. Disable shared editorial HTML/content caching as required by the PRD; static versioned assets and images may be cached appropriately.

Public requirements:

- Only real published API content; no seeded fallback when the API fails.
- A featured article and latest cards without needless featured-card duplication.
- A labeled native GET category form using `kategori` in the public URL and the documented API category parameter internally.
- Category changes reset pagination to page 1. Preserve category/page state in pagination links.
- Nine articles per listing page by default; intentional first/last pagination states.
- Distinct empty site/category, invalid category, 404, upstream 503, and image-failure states.
- Article author, actual publication/checked dates where applicable, deterministic reading time, photo credit, sources, and a return-to-guides action.
- Honest About/editorial/AI/portfolio disclosures, updated from prototype copy to the actual implementation status.
- Initial HTML title/description/canonical/OG/Twitter metadata, safe Article/Breadcrumb JSON-LD, dynamic published-only sitemap, and production/staging robots policies.
- Public content and category filtering work without JavaScript.

Implement all approved Assistant states with actual API state: unselected, ready, generating, valid, cached, applying, applied, and the distinct error states. Use Unicode code-point counters consistently with the backend, real editable fields and selected-field controls, accessible labels, visible focus, live regions, disabled pending actions, and explicit conflict recovery.

Implement the missing custom CMS login, list/editor, category/author, and media screens with the existing admin visual language and minimal scope. No misleading Strapi branding, fake integration labels, copied prototype handlers, or dead action buttons. Publication is a separate deliberate editor action, never part of Assistant generation/application or MCP automation.

Do not add active search, related articles, maps, bookings, favorites, comments, newsletters, public registration, or a reader chatbot unless separately authorized or explicitly accepted as P1 after every P0 gate passes.

## 15. Execution DAG and Integration Gates

### Phase A — Preflight and shared foundation

1. Inspect the actual workspace, current PRD, live designs, runtime/tool availability, secret presence, MCP capabilities, and deployment access. Include the Bruno CLI and Orca Browser tooling in this preflight; read the version-matched Orca CLI/browser guide before driving its embedded browser.
2. Create the dedicated application repository, safe ignore rules, documentation checklist, monorepo/package setup, Python environment, and pinned framework scaffolds using official tools.
3. Install and configure real PostgreSQL, database sessions/migrations, validated configuration, public/admin/editorial DTOs, rich-text schema, error envelope, media contract, and authentication/principal interfaces.
4. Set explicit file ownership and a single migration/schema/lockfile integration owner.
5. Launch Astro and FastAPI and observe their actual health responses; this is not completion of the product.

### Phase B — Independent implementation wave

Run substantial independent slices in parallel after their common contracts exist:

- Backend content/authentication/storage: schema, draft/published model, sessions/permissions, CRUD, publish guards, public DTOs, health/readiness, and media service integration.
- Public frontend: approved design implementation, SSR API integration, routing, filters/pagination, article/source layout, SEO, and real empty/error states.
- Admin frontend: functional login/session UI, article editor/list, categories/authors/media UI, and the Assistant shell against the frozen API contract.
- Assets/content preparation: legal source manifest, real Cloudinary uploads, validated content fixtures, and idempotent seeder inputs. This worker must not compete with the backend migration owner.

Integrate a real non-AI slice first: save draft -> publish explicitly -> published API -> Astro page with real Cloudinary image. Prove that saving another draft does not change the live version. Deploy this slice early when access is available; do not wait for final UI polish to discover hosting constraints.

### Phase C — Editorial and MCP completion

After content/authentication services exist:

- Implement Gemini structured generation and the database-backed quota/lease/cache/idempotency/apply services under one clearly owned transaction boundary.
- Connect the Assistant UI to these real services and implement conflict/error/manual-fallback behavior.
- Implement the authenticated application MCP transport/tools using the same services, with explicit allowlist and principal mapping.
- Finish seeding through the actual services and run the integrated checks.

These slices may overlap only where their interfaces and file ownership are genuinely independent. Do not run multiple agents against the same editorial models/migrations/service file.

### Phase D — Verification, production builds, and deployment

The coordinator runs the integrated tests/builds, executes the Bruno backend acceptance collection against the running FastAPI service, and verifies the public/admin frontend directly in Orca Browser. Exercise the real changed paths, fix failures, and verify again. Independent review informs fixes but does not replace API or browser runtime evidence.

Deploy the backend to the actual FastAPI Cloud account and the Astro SSR frontend to the owner-approved compatible host. Use Neon and Cloudinary production configuration when supplied. Authenticate through supported provider mechanisms. Never fabricate provider URLs, invent CLI success, enable billing, or provision duplicate infrastructure.

Apply migrations, bootstrap the private production editor safely, seed approved content/assets, and verify HTTPS/live publication, draft isolation, real Gemini generation, apply, publish/unpublish, sitemap updates, and restart persistence.

If a genuinely inaccessible external prerequisite prevents deployment, finish all reachable code, local end-to-end behavior, tests, production build/deployment artifacts, and documentation. Ask only for the missing access/input. Record the exact external blocker and do not label localhost or deploy-ready source “production complete.” Do not ask for information already available through files, tools, or account configuration.

## 16. Verification Requirements

### 16.1 Backend API Verification — Bruno

Use Bruno as the primary backend HTTP/API acceptance and smoke-testing tool. Create a version-controlled collection in `tests/bruno/`, using Bruno's supported collection/request format, assertions, scripts, and environment configuration. Pin the official Bruno CLI in the project tooling and verify commands/options against the installed version rather than guessing flags.

Organize requests for health/readiness, public content, admin authentication and CSRF, article/category/author CRUD, draft/publish/unpublish, media, Editorial Assistant, and application MCP HTTP authentication/allowlist behavior where supported. Exercise real FastAPI endpoints and persist created resource IDs/session state through supported collection variables rather than hardcoding database IDs.

- Assert exact expected status codes, DTO/schema properties, permissions, selected-field changes, draft/published separation, and public visibility transitions—not merely 200 responses or nonempty bodies.
- Provide non-secret environment templates for local development, an isolated test API, and an explicitly authorized live smoke run. Supply passwords, session/CSRF tokens, content/MCP tokens, and other secrets through supported private environment or CI secret mechanisms; never commit them in `.bru` requests or environment files.
- Run automated destructive/boundary cases against a dedicated test FastAPI instance and real isolated PostgreSQL database. Keep deterministic Gemini/Cloudinary test doubles confined to this explicit test environment; do not call the real provider 20 times to prove the quota boundary.
- Keep the live-smoke subset separate and deliberately selected. Real Gemini generation and real Cloudinary upload/delivery require a small, authorized smoke run with actual credentials. Never run the entire mutation/cleanup collection against production by default.
- Exercise login/session/CSRF behavior, authenticated and unauthorized operations, publication transitions, idempotency, cache, selected-field apply, conflict responses, quota errors, and upload validation with request-level assertions.
- Run the Bruno CLI collection as an integration gate and in CI after the test API is ready. Produce JSON/JUnit or other supported reports, sanitize sensitive request/response data, and record actual commands, environment, and results in `docs/verification.md`.
- OpenAPI import may generate a starting collection, but complete its authentication flows, fixtures, assertions, cleanup, and behavioral scenarios. An imported request list alone is not a finished backend test suite.

Bruno is the primary API acceptance layer, not a substitute for all lower-level proof. Keep focused pytest/PostgreSQL integration tests for atomic quota/lease races, transaction locking, UTC time boundaries, crash recovery, and other behaviors a sequential HTTP collection cannot reliably establish. Use the official MCP client for protocol/lifecycle checks not covered by Bruno. All complementary tests must verify meaningful consumer-visible invariants.

### 16.2 Frontend Verification — Orca Browser

Use Orca's actual embedded browser as the primary frontend and admin verification surface. Read the `orca-cli` skill, resolve the correct Orca executable for the current environment, and load its version-matched browser reference. Use documented commands and inspect `--help` for unsupported operations; do not invent flags or pretend a different browser is Orca.

Launch the running Astro frontend and FastAPI-served React admin, then create dedicated application-worktree browser tabs at their actual URLs. Use a snapshot → interaction → fresh snapshot loop. Re-snapshot after navigation or DOM changes, and use fresh element references. Pin an explicit browser page ID for concurrent browser work so one agent does not navigate another agent's tab.

Directly exercise public navigation, category forms, pagination, article reading, source links, 404/503/image-failure states, admin login/logout, article editing, media upload/selection, Assistant generation/review/edit/selection/apply, conflict recovery, and deliberate publication/unpublication. Observe the rendered result and backend-visible state; static Doop screenshots and frontend mock fixtures are not application verification.

- Check 360px, 390px, 768px, and 1440px layouts using supported viewport controls. Compare real screenshots with the approved Doop references, including homepage v2 and the matching article/image/source edges.
- Verify keyboard navigation, visible focus, labels, pending/disabled controls, status messages, and distinct error recovery. Do not replace actual interaction with source-code inspection.
- Inspect Orca Browser console/network evidence for unexpected failures, broken images, incorrect requests, and accidental credential exposure. Never put secret values in screenshots or shared reports.
- Verify public reading and category filtering with JavaScript genuinely disabled using supported browser controls. If Orca lacks a required emulation/control capability, document that limitation and use a supported complementary check for that specific requirement; do not simulate disabled JavaScript with CSS or claim an unperformed check.
- Save representative, secret-safe screenshots and record URLs, viewport sizes, interaction steps, observed results, and limitations in `docs/verification.md`.
- Close only the verification tabs you created. Preserve the owner's other browser tabs and worktree state. If the Orca browser host is offline or inaccessible, follow documented recovery and report the exact prerequisite rather than fabricating a successful browser check.

Do not add another browser E2E framework merely to duplicate already exercised Orca checks. Complementary CI/browser automation is acceptable when it proves a genuinely unsupported or otherwise unverified requirement, and must be identified accurately in the evidence.

### 16.3 Behavioral Coverage and End-to-End Proof

Implement the consumer-visible tests in PRD T-01 through T-20, adapted to FastAPI, plus the new architecture's necessary authentication/MCP/media cases. Use an isolated real PostgreSQL database for persistence and concurrency tests; deterministic provider fakes are appropriate for automated failure/boundary tests, but are not evidence of live Gemini integration.

Required coverage includes:

- Draft exclusion and published snapshot isolation after draft save/apply.
- Public-token and unauthenticated rejection of private/mutation/editorial/MCP operations.
- Role/article permissions, request ownership, session expiry/logout, and cookie-mutation CSRF protection.
- Publish validation without requiring complete draft saves.
- Input token boundaries, unsafe/invalid/truncated AI output, and no article mutation on generation failure.
- Quota 19/20/21, concurrent reservations, a unique global lease, UTC rollover, conservative timeout/crash behavior, and quota-store fail-closed behavior.
- Idempotent generation, valid cache reuse/version invalidation, selected-field-only apply, atomic stale-draft conflicts, identical apply replay, and incompatible replay conflicts.
- Safe rich-text/source/media handling and referenced-media deletion protection.
- MCP missing/wrong key, protected discovery, permitted tools, forbidden publish/delete/secret/schema operations, and the same editorial safeguards through MCP.
- Seeding twice without duplicate content/assets or damage to user data.

Do not write tests that merely assert copied text, source-code strings, forwarding mocks, nonempty output, or incidental implementation defaults. Keep tests that prove actual boundaries, transitions, permissions, publication behavior, and errors.

Runtime proof must include:

1. Actual public/admin surfaces at 360px, 390px, 768px, and 1440px; screenshots against approved references, no horizontal overflow, and visible usable controls.
2. Public reading and category form behavior with JavaScript disabled.
3. Keyboard navigation, focus indicators, labels, status announcements, and error recovery.
4. A real draft created through the admin, still 404 publicly.
5. At least one actual Gemini generation using the configured provider/model, with safe usage evidence.
6. Review/edit/select/apply into the draft without changing its published version.
7. Explicit publication, fresh-request list/detail/SEO/sitemap updates, unpublication, and republishing where appropriate.
8. A real authorized MCP client call and rejected unauthorized/forbidden calls.
9. Real Cloudinary image upload/delivery and persistence after backend restart.
10. A production build and the same critical flow at real deployment URLs when deployment prerequisites are available.

Measure Lighthouse only if actually run; record environment and results rather than inventing scores. Target the PRD's performance/accessibility goals without treating one metric as proof of correctness.

## 17. Required Documentation and Delivery

Maintain `docs/implementation-status.md` throughout execution with every P0 item, its owner, actual state, dependencies, evidence, and external blockers. Keep architecture decisions, endpoint contracts, and intentional scope unchanged/changed notes current.

Deliver:

- Complete frontend, custom admin, FastAPI backend, migrations, application MCP server, Cloudinary integration, and seed content/assets.
- Locked dependencies and reproducible development/production commands.
- A safe, complete `.env.example` with the corrected Cloudinary secret name.
- A complete Bruno API collection, safe environment templates, reproducible CLI/CI commands, and sanitized reports; focused database/concurrency tests remain complementary.
- Orca Browser verification records and representative frontend/admin screenshots from the actual running application, not just the design canvas.
- README instructions for installation, environment setup, database migration, private admin bootstrap, assets/seeding, development, builds, tests, and deployment.
- Architecture documentation covering the FastAPI replacement, draft/published storage, token/session/MCP boundaries, Neon portability, and Cloudinary ownership.
- Real verification records, source/license records, backup/restore and rollback procedures, safe logging/health/kill-switch runbooks, and a truthful demo script.
- CI for the relevant typechecks/lint, focused backend tests, Bruno CLI acceptance collection against an isolated running test API/PostgreSQL, and frontend/admin/backend build/package checks. Record Orca Browser UI verification separately and explain whether deployment is automatic or manual.
- Actual local and deployed URLs, actual runtime/model/provider versions, exercised checks, and remaining external prerequisites without secret values.

Do not deliver stubs, placeholders, fake APIs, no-op guards, fake Cloudinary URLs, a permanently mocked provider, or “MVP scaffolding” while claiming implementation is complete. Do not claim production until the live FastAPI/Astro/Neon/Cloudinary/Gemini flow has actually passed.

## 18. Known Inputs and Genuine External Prerequisites

Known and usable as inputs:

- Current `PRD.md`, including FastAPI + application MCP revisions.
- Approved Doop canvas and specific frames above.
- Private Gemini, application MCP, and Cloudinary values observed as populated locally, but not yet validated for implementation.
- Cloudinary Environment Config MCP configuration; Asset Management MCP is optional because the official SDK can upload.
- Local PostgreSQL may be provisioned using an existing authorized local runtime.

Before production completion, resolve only what is genuinely unavailable:

- Access to the intended FastAPI Cloud account and its supported deployment/authentication flow.
- The approved Astro SSR hosting account/target.
- Neon application/direct connection details, supplied through a private environment/secret store when the production transition begins.
- A custom Gemini gateway base URL/authentication explanation only if those credentials actually require one.
- Any explicit spending authorization required by the chosen existing hosting/storage plans; absence of authorization is not permission to enable billing.

A final geographic focus, final name/logo, or custom domain is not a blocker to local implementation. Use honest labeled sample content, the approved working wordmark, and provider subdomains unless the owner supplies different decisions.

## 19. Start Now

Start with Phase A. State the confirmed architecture, source precedence, known external dependencies, and your first concrete actions briefly. Then execute rather than returning only a plan.

Build the non-AI content-to-publication slice first. Parallelize the independent frontend/backend/admin/asset work after contracts are established. Finish the real editorial workflow and protected MCP integration, verify everything through the running application, and continue until the specified deliverable is complete or only a precisely documented external dependency remains after all reachable work has been finished.
