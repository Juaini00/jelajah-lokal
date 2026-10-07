# Jelajah Lokal — admin editor

React 19 SPA served by FastAPI under `/admin/` (Vite `base: '/admin/'`). FastAPI falls back to `index.html` for client routes and serves hashed `/admin/assets/*` with an immutable cache header.

## Structure

```
src/lib/api.ts         fetch wrapper (CSRF, error envelope incl. `fields`), session store, error guidance
src/lib/queries.ts     TanStack Query client, query keys/hooks, cache writers (no refetch after mutations)
src/lib/router.tsx     History router: /articles, /articles/:id, /media, /categories, /authors, /assistant?article=
                       plus useLeaveGuard (in-app nav, back/forward, tab close)
src/lib/validation.ts  Client mirror of server save rules and publish requirements; focusField() jump-to-field
src/lib/types.ts       Types derived from contracts/api.d.ts (generated OpenAPI)
src/editor/            TipTap editor restricted to the frozen body schema; doc.ts converts Block[] <-> ProseMirror JSON
src/ui/                Dialog/confirm/toast primitives (no window.confirm), form controls, media picker/uploader
src/pages/             Articles list, article editor, media library, categories/authors, Editorial Assistant
```

## Behaviour worth knowing

- **Asisten AI (editor sidebar)** — one click saves pending edits, then asks Gemini (`/editorial/generate`) for summary, SEO description and tags; each suggestion is shown next to the current value and applied only on confirmation (`/editorial/apply`, or into the form when there are unsaved edits). **Periksa klaim** (`/editorial/review`) flags price/schedule/contact/access sentences quoted verbatim from the saved body (click to select them in the editor) plus missing practical info; it never edits the article. The readiness checklist and article list point to the assistant where it can fill gaps; the nav shows remaining daily quota.
- Publish readiness is computed live from the draft and shown as a checklist; the publish button shows the number of unmet requirements and jumps to the first one. The server stays authoritative: `PUBLISH_VALIDATION_FAILED` and `INVALID_REQUEST` return per-field `fields[]`, rendered inline and as jump links.
- Unsaved edits are mirrored to `localStorage` (`jelajah-admin:recovery:<id>`) and offered for restore after a crash/close; restoring onto a newer server revision merges field-by-field.
- `ARTICLE_CHANGED` (or a newer revision arriving via refetch) opens a merge dialog: fields you changed are kept, the rest come from the server.
- A 401 keeps the page mounted and shows a re-login dialog, so in-progress edits survive session expiry.
- `⌘/Ctrl+S` saves the draft.

## Commands

```bash
pnpm --filter admin build   # tsc -b && vite build → dist/ (served by FastAPI)
pnpm --filter admin check   # tsc -b
pnpm --filter admin lint    # oxlint
```
