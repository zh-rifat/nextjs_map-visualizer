# context.md

Working notes for `.ai-agent/`-aware sessions. Append a one-line entry every time you open a new file in this repo (per instructions.md §9).

---

## 2026-07-03 — Initial context + architecture generalized; refactored to two orthogonal backend axes

### Files opened this session
- `.ai-agent/prompts.md` — read; identified open tasks.
- `.ai-agent/architecture.md` — read; rewrote three times.
- `.ai-agent/instructions.md` — read; rewrote.
- `.ai-agent/skills.md` — read; rewrote.
- `.ai-agent/context.md` — read (was empty); now seeded.
- `.ai-agent/updates.md` — created; updated.
- `package.json`, `tsconfig.json`, `next.config.ts`, `app/` — read via scan agent (ground-truth check).
- `/media/zh_rifat/cUNIVERSE/Programming/Web/projects/RoboVerse/shop-roboflybd/` — read via scan agent (reference for Combination B patterns).

### Architectural assumption-deltas uncovered
- The current `architecture.md` was a template for a pure Next.js + Prisma stack; it did not address external backends.
- `package.json` is a bare `create-next-app` skeleton — no Prisma, no RTK Query, no auth lib, no API client.
- `tsconfig.json` path alias is `"@/*": ["./*"]` (root, not `./src/*`). When code lands under `src/`, either move the alias or adjust imports.
- `.gitignore` only knows Node/Next — no Python ignores yet. Will need extending if an external Python backend is added.
- No `docker-compose.yml`, no `Makefile`, no `prisma/`, no `backend/`.

### Framing decisions (latest revision)
- Architecture is structured around **two orthogonal axes** — backend source (`internal` | `external`) and frontend data client (`server-actions` | `rest-client`) — yielding three realistic combinations (A, B, C).
- Architecture is **fully generic for any Next.js app**, not portfolio-specific. All portfolio-specific references (terminal, Hyprland, virtual FS, `C:\RIFAT\`, Project/Skill/Experience/AdminUser models) have been removed. Replace with domain placeholders (`<domain>`, `<feature>`, `Entity`, `Item`).

### Combination-pinning decision
- No combination has been chosen for this project yet. The architecture supports all three. A future task will pin one and add the corresponding code skeleton.

### Active tasks
- See `prompts.md` — current open tasks are wrapped in HTML comments (already done).
- See `updates.md` for the diff summary and follow-up tasks.

---

## 2026-07-03 — Google Sheet reader utility added

### Files opened this session
- `.ai-agent/prompts.md` — read; identified new active tasks.
- `.ai-agent/updates.md` — read; appended new entry.
- `.gitignore` — read; added `!.env.example`.
- `package.json`, `tsconfig.json`, `app/`, `public/`, `next.config.ts` — read (ground-truth check before adding code).

### Files created this session
- `.env.example` — documents `GOOGLE_SHEET_URL` and per-alias `GOOGLE_SHEET_<ALIAS>_URL` env vars.
- `src/lib/google/sheet.ts` — server-side TypeScript utility: `getSheetRows<T>()`, `loadSheet<T>()`, `parseSheetId()`, `buildPublishedCsvUrl()`, `parseCsv()`, `clearSheetCache()`.

### Approach taken
- Used the **published-CSV** endpoint pattern (`/gviz/tq?tqx=out:csv&gid=...`). No API key, no OAuth, no Google Cloud project required. Only requirement: sheet shared as "Anyone with the link can view".
- Errors are returned (not thrown) from `getSheetRows` so callers decide how to handle missing env vars / HTTP failures; `loadSheet` is the convenience wrapper that throws.
- 5-minute in-memory cache by default; supports Next.js `revalidate` and `tags` opts for App Router fetch cache.

### Active tasks (post-session)
- Wrap the new tasks in `prompts.md` HTML comments now that the utility is shipped.

---

## 2026-07-03 — `app/` moved to `src/app/`, tsconfig alias updated

### Files opened this session
- `app/` — read each file (favicon.ico, globals.css, layout.tsx, page.tsx) before moving.
- `tsconfig.json` — read; updated path alias.
- `package.json`, `next.config.ts`, `next-env.d.ts` — re-checked after the move.

### Files changed this session
- `app/` (deleted at root) → `src/app/` (4 files: favicon.ico, globals.css, layout.tsx, page.tsx).
- `tsconfig.json` — `"paths": { "@/*": ["./*"] }` → `"paths": { "@/*": ["./src/*"] }`.

### Verification
- `tsc --noEmit -p .` → 0 errors.
- `next build` → ✓ Compiled successfully; `/` prerendered as static content.

### Notes
- The new `src/lib/google/sheet.ts` (added in the prior session) now lives under the alias root and is importable as `@/lib/google/sheet` as intended.

---

## 2026-07-03 — Sheet reader: added API-key + service-account auth

### Files opened this session
- `.env.example` — read; rewrote with three sections (PUBLIC / API_KEY / SERVICE_ACCOUNT).
- `src/lib/google/sheet.ts` — read; extended with auth modes.
- `.ai-agent/prompts.md` — read; wrapped new task after completion.

### Files changed this session
- `.env.example` — added `GOOGLE_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` with setup instructions.
- `src/lib/google/sheet.ts` — added `AuthMode` type, `resolveAuthMode()`, service-account JWT minting via Node `crypto`, Sheets API v4 fetch path (`fetchViaApi`), and `buildSheetsApiUrl()` / `resolveApiRange()` helpers. Backward compatible: when no auth env vars are set, the reader still uses the published-CSV path.
- `.ai-agent/updates.md` — added new entry.
- `.ai-agent/prompts.md` — wrapped the new auth task.

### Verification
- `tsc --noEmit -p .` → 0 errors.
- `next build` → ✓ compiled.
- Smoke tests passed: auth-mode detection across all 6 env combinations; JWT signing with a generated key produces a valid assertion that verifies.

---

## 2026-07-03 — Sheet reader simplified to 3-var env; `/data` route added

### Files opened this session
- `.env.example` — read (user overwrote with `GOOGLE_CLIENT_ID`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`).
- `src/lib/google/sheet.ts` — read; rewrote to use the 3-var env form.
- `src/app/` — listed; created `src/app/data/` and added `page.tsx`.
- `.ai-agent/prompts.md` — read; wrapped new tasks after completion.

### Files changed this session
- `src/lib/google/sheet.ts` — simplified to service-account-JWT-only. Required env: `GOOGLE_CLIENT_ID` (the client_email, NOT the OAuth numeric ID), `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`. Optional `GOOGLE_SHEET_RANGE` (default `"A1:Z"`). Added in-process access-token cache. Removed: API-key mode, published-CSV path, JSON/file loaders.
- `.env.example` — rewrote with the 3-var form + setup instructions. Added critical warning that `GOOGLE_CLIENT_ID` is the service-account email.
- `src/app/data/page.tsx` — new Server Component calling `getSheetRows<SheetRow>()` and rendering an HTML table. Handles error / empty / header-only / success states. `dynamic = "force-dynamic"` so it re-fetches on every request.
- `.ai-agent/updates.md` — added new entry.
- `.ai-agent/prompts.md` — wrapped the two new tasks.

### Verification
- `tsc --noEmit -p .` → 0 errors.
- `next build` → ✓ compiled. New route `/data` shown as `ƒ (Dynamic)`.
- Smoke test: JWT minting produces a valid 3-part assertion with correct `iss` / `scope` / `aud`; signature verifies.

---

## 2026-07-03 — Coordinate parser + `/map` page with Leaflet

### Files opened this session
- `.ai-agent/prompts.md` — read; identified new tasks.
- `src/lib/google/sheet.ts` — re-checked signature (`getSheetRows` vs `loadSheet`).
- `src/app/globals.css` — re-checked (didn't need to modify).
- `package.json` — read; added leaflet and @types/leaflet.

### Files added this session
- `src/lib/geo/coordinates.ts` — pure coordinate utility: `parseLatLng`, `mapRowsWithCoordinates`, `computeBounds`. Configurable column name (default `"Map Coordinates"`).
- `src/app/map/MapClient.tsx` — `"use client"` Leaflet map with inline-SVG marker icons, OpenStreetMap tiles, bounds fitting, popup binding, cleanup on unmount.
- `src/app/map/page.tsx` — Server Component route that fetches the sheet, filters rows with valid coordinates, builds popup HTML, and passes markers to `MapClient`.

### Files changed this session
- `package.json` — added `leaflet@^1.9.4` (dep) and `@types/leaflet@^1.9.21` (devDep).
- `.ai-agent/updates.md` — added new entry.
- `.ai-agent/prompts.md` — wrapped the new tasks.

### Verification
- `tsc --noEmit -p .` → 0 errors (after fixing two issues: chose `getSheetRows` over `loadSheet` for the result type; relaxed `MappedRow.data` from `Omit<Data, "Map Coordinates">` to `Data` because the column name is runtime-configurable).
- `next build` → ✓ compiled. Routes: `/` (static), `/_not-found` (static), `/data` (dynamic), `/map` (dynamic).
- Parser smoke tests: 19/19 `parseLatLng` cases pass; 7/7 `mapRowsWithCoordinates` end-to-end cases pass.

---

## 2026-07-03 — Bottom-sheet details + per-Profession marker colors + legend

### Files opened this session
- `.ai-agent/prompts.md` — read; identified new tasks.
- `src/app/map/MapClient.tsx` — read; rewrote.
- `src/app/map/page.tsx` — read; rewrote.

### Files added this session
- `src/lib/geo/professions.ts` — `extractProfessions` (case-insensitive dedupe, insertion order), `buildColorMap` (12-color deterministic palette), `colorFor` (case-insensitive lookup with fallback).

### Files changed this session
- `src/app/map/MapClient.tsx` — major rewrite:
  - Markers now carry `{ id, coordinates, color, data }` (no more pre-rendered popup HTML).
  - Marker click sets React state; no `bindPopup` calls.
  - Each marker uses a **divIcon** with an inline colored SVG pin.
  - New `<BottomSheet>`: mobile = full-width bottom sheet; desktop = right-side panel (384px). Close via X button, Escape key, or scrim click (mobile).
  - New `<Legend>` above the map: per-profession pills with color swatch + count; click toggles highlight state.
  - Map container `h-[80vh] min-h-[520px]` for a more generous desktop view.
- `src/app/map/page.tsx` — removed `renderPopupHtml`/`escapeHtml`; now extracts professions, builds color map, builds legend entries with counts; passes `{markers, legend}` to MapClient.
- `.ai-agent/updates.md` — added new entry.
- `.ai-agent/prompts.md` — wrapped new tasks.

### Verification
- `tsc --noEmit -p .` → 0 errors.
- `next build` → ✓ compiled. `/map` shown as `ƒ (Dynamic)`.
- Smoke test: 8-row sample (with duplicates, case variants, whitespace, empty values) → 3 distinct professions extracted in correct order, color map assigned deterministically.