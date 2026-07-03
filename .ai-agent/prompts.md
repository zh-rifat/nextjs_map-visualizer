======================================================================================================

- All instructions, architecture, skills, and context in `.ai-agent/` MUST be followed strictly
- Commented tasks <!-- ... --> = already done — do NOT redo them
- Uncommented tasks = do these now, then wrap in <!-- --> after completion
- Write updates.md to keep track what is updated in api/features

======================================================================================================

# issues
 - 1. ~~the map view is not responsive its only showing mobile view on desktop~~ — FIXED 2026-07-03: map container is now h-[80vh] min-h-[520px] w-full inside a max-w-7xl main; bottom-sheet on desktop is a 384px right-side panel that doesn't shrink the map.

# fixes
- 1. ~~fix the issue~~ — fixed 2026-07-03 (see issues #1)



# tasks
<!--
- the architecture.md was a template for fullstack nextjs app; update it so it documents a generic Next.js architecture with two orthogonal backend axes (internal/external × server-actions/rest-client) yielding three realistic combinations (A: pure fullstack Next.js; B: Next.js + external REST + RTK Query; C: Next.js Route Handlers + RTK Query). Architecture should be generic — not portfolio-specific.
- reference: `/media/zh_rifat/cUNIVERSE/Programming/Web/projects/RoboVerse/shop-roboflybd` (Next.js + Django REST + SimpleJWT + RTK Query)
- DONE 2026-07-03: rewrote architecture.md, instructions.md, skills.md to a generic two-axis framing. See updates.md for the diff summary.

- read a Google Sheet using a link from .env
- write .env.example with the necessary variable
- write a utility that reads the sheet and returns the data in a usable format
- DONE 2026-07-03: added .env.example (GOOGLE_SHEET_URL + per-alias GOOGLE_SHEET_<ALIAS>_URL), and src/lib/google/sheet.ts (getSheetRows / loadSheet / parseCsv / parseSheetId / buildPublishedCsvUrl). Uses the published-CSV endpoint — sheet must be shared as "Anyone with the link can view". See updates.md for the diff summary.
-->
<!-- - the app dir should be inside the src dir, not at the root; update tsconfig.json path alias accordingly; -->
<!--
- to read google sheets some secret keys are needed; add them to .env.example, and update the sheet reader utility to read them from env
- DONE 2026-07-03: extended .env.example with GOOGLE_API_KEY, GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_SERVICE_ACCOUNT_KEY_FILE. Extended src/lib/google/sheet.ts with three auth modes (service-account > api-key > public, auto-detected). Service-account auth self-signs a JWT with Node's built-in crypto (no new npm deps) and exchanges it for an access token. API-key + service-account modes use the Sheets API v4 JSON endpoint; public mode still uses the published-CSV path (backward compatible). Verified: tsc --noEmit (0 errors), next build (✓), mode-detection across 6 env combos, JWT signing round-trip. See updates.md.
-->
<!--
- the .env.example is updated read it and implement the utility to read the sheet using the new env vars
- in the app router /data route, use the new utility to read the sheet and visualize the data in a table on the page
- DONE 2026-07-03: simplified src/lib/google/sheet.ts to service-account-JWT-only — reads GOOGLE_CLIENT_ID (the service-account client_email, NOT the OAuth numeric ID), GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID, optional GOOGLE_SHEET_RANGE. Added in-process access-token cache (cached until 5 min before expiry). .env.example rewritten with step-by-step setup instructions and the client_email warning. Added src/app/data/page.tsx — Server Component that calls getSheetRows<SheetRow>() and renders an HTML table; handles error/empty/header-only/success states; dynamic = "force-dynamic" so it re-fetches per request. Verified: tsc --noEmit (0 errors), next build (✓ compiled, /data shown as ƒ Dynamic). See updates.md.
-->

<!--
- in the sheet there is a column named `Map Coordinates` where gps coordinates are stored as a string in the format `lat,lng` (e.g., `23.8103,90.4125`). filter out valid rows with valid coordinates
- store each row in a new array of objects with the following structure: `{ coordinates: { lat: number, lng: number }, data: {...rest} }`
- use leaflet to visualize the valid coordinates on a map in the /map page, with each marker showing the rest of the data in a popup when clicked
- DONE 2026-07-03: added src/lib/geo/coordinates.ts (parseLatLng + mapRowsWithCoordinates + computeBounds; configurable column name; 19/19 + 7/7 smoke tests pass). Added src/app/map/MapClient.tsx ("use client" Leaflet wrapper with inline-SVG marker icons to bypass Next.js bundler imagePath issues, OSM tiles, bounds-fit + invalidateSize + cleanup). Added src/app/map/page.tsx (RSC fetches sheet, filters, builds server-side popup HTML, hands markers to MapClient; error/no-valid/success states; collapsible raw-data table). Installed leaflet@^1.9.4 + @types/leaflet@^1.9.21. Verified tsc --noEmit (0 errors) and next build (✓ compiled, /map shown as ƒ Dynamic). See updates.md.
-->

<!--
- currently the popup content is showing when the marker is clicked; but need to show it as a bottom sheet instead of a popup; so need to implement a bottom sheet that shows the data when a marker is clicked
- the marker color should be in different colors based on the value of column `Profession`; map the professions in a set and generate different colors; show map legend for the colors and their corresponding professions
- DONE 2026-07-03: replaced Leaflet bindPopup with a custom <BottomSheet> — mobile = full-width bottom sheet with scrim + close button; desktop = 384px right-side panel; Esc key also closes. Added src/lib/geo/professions.ts (extractProfessions with case-insensitive dedupe in insertion order, buildColorMap with 12-color deterministic palette, colorFor lookup). MapClient rewritten: each marker now uses L.divIcon with an inline colored SVG pin (no external assets); marker click sets React state. Added <Legend> above the map with per-profession pills (color swatch + name + count, click toggles highlight). Also addressed the "map not responsive on desktop" issue by raising container to h-[80vh] min-h-[520px] inside max-w-7xl main. Verified tsc --noEmit (0 errors), next build (✓ compiled). See updates.md.
-->