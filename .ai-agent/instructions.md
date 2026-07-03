# Universal Implementation Instructions

## Goal
Domain-agnostic coding instructions applicable to any Next.js project, with explicit support for **two orthogonal backend choices** that combine into three realistic architectures:

- **Backend source:** `internal` (Prisma + Next.js Server Actions / Route Handlers) | `external` (separate REST service: Django, Express, NestJS, Go, …)
- **Frontend data client:** `server-actions` | `rest-client` (Redux Toolkit Query + axios)

The three realistic combinations:
- **A.** `internal` + `server-actions` — pure full-stack Next.js
- **B.** `external` + `rest-client` — Next.js + external REST + RTK Query
- **C.** `internal` + `rest-client` — Next.js Route Handlers + RTK Query

## 1. Structural Rules
- Keep route/page files focused on composition and wiring.
- Move domain-heavy logic into feature modules or dedicated components.
- Keep shared primitives in a central location (`components/`, `lib/`, `types/`).
- Prefer predictable folder conventions over one-off structures.
- **The frontend is backend-agnostic in shape** — only the data layer directory changes:
  - `server-actions` projects use `src/server/{queries,actions}/`.
  - `rest-client` projects use `src/lib/api/{baseApi,axiosInstance,endpoints}/` and `src/lib/slices/`.
  - Combination C adds `src/app/api/<resource>/route.ts` Route Handlers.
- **Never import Prisma from a component or feature.** Only `src/server/**` may import it (Combination A), or `src/app/api/**` Route Handlers (Combination C).

## 2. Data Layer Rules

Pick the **data client** per project, then pick the **backend source**. Each is a separate decision.

### 2a. Frontend data client = `server-actions`
- Reads: RSC calls `src/server/queries/*.ts` which use Prisma directly.
- Writes: Server Actions in `src/server/actions/*.ts` with `"use server"` and an `auth()` check.
- Cache invalidation via `revalidatePath` / `revalidateTag` inside the action.
- **No RTK Query needed for backend data.** RTK may still be used for UI state.

```ts
// src/server/actions/<domain>.ts
"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { auth } from "@/server/auth";

export async function updateEntity(id: string, data: EntityUpdateInput) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  await db.entity.update({ where: { id }, data });
  revalidatePath("/<public-route>");
  revalidatePath("/<admin-route>");
}
```

### 2b. Frontend data client = `rest-client`
- Use a shared API client base configuration (base URL, auth headers, error handling) — exactly **one** `axiosInstance`, **one** `baseApi`.
- Group endpoints by feature/domain in `src/lib/api/endpoints/<domain>Api.ts`.
- Export strongly typed query and mutation hooks (RTK Query generates these from `injectEndpoints`).
- Define cache behavior intentionally via `providesTags` / `invalidatesTags`.
- **Never create a second axios instance or a second baseApi.** Always extend via `injectEndpoints`.

#### Minimal Endpoint Pattern (`rest-client`)
```ts
// src/lib/api/endpoints/<domain>Api.ts
import { baseApi } from "@/lib/api/baseApi";

type Item = { id: string; name: string };
type CreateItemPayload = { name: string };

export const itemsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getItems: builder.query<Item[], void>({
      query: () => ({ url: "items", method: "GET" }),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: "Item" as const, id })), { type: "Item", id: "LIST" }]
          : [{ type: "Item", id: "LIST" }],
    }),
    createItem: builder.mutation<Item, CreateItemPayload>({
      query: (data) => ({ url: "items", method: "POST", data }),
      invalidatesTags: [{ type: "Item", id: "LIST" }],
    }),
  }),
});

export const { useGetItemsQuery, useCreateItemMutation } = itemsApi;
```

#### RSC Read Pattern (`rest-client`)
```ts
// src/server/queries/items.ts (or inline in the page)
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/items/`, {
  next: { tags: ['items'] },
  headers: { Authorization: `Bearer ${process.env.SERVER_ACCESS_TOKEN ?? ''}` },
  cache: 'no-store', // or revalidate: 3600 for ISR
});
if (!res.ok) throw new Error('Failed to load items');
return res.json();
```

### 2c. Backend source = `external` (Combination B)
- The REST backend is in a separate repo. The frontend never imports it directly — only via HTTP.
- CORS must be configured on the backend to allow the Next.js origin.
- `NEXT_PUBLIC_API_URL` points at the external service.
- All other `rest-client` rules apply.

### 2d. Backend source = `internal` + `rest-client` (Combination C)
- "Backend" is implemented as Next.js Route Handlers under `src/app/api/<resource>/route.ts`.
- Route Handlers read/write Prisma directly (no Server Actions for data — only for cache revalidation if needed).
- `NEXT_PUBLIC_API_URL` points to the Next.js origin itself (e.g. `http://localhost:3000/api`).
- `baseApi.baseUrl` should be `/api/`.
- Route Handler changes must keep URLs in sync with `baseApi.baseUrl` + endpoint paths.

```ts
// src/app/api/items/[id]/route.ts
import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { auth } from '@/server/auth';
import { db } from '@/server/db';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  const data = await req.json();
  const item = await db.item.update({ where: { id: params.id }, data });
  revalidatePath('/<public-route>');
  revalidateTag('items');
  return NextResponse.json(item);
}
```

## 3. UI and Component Rules
- Shared components should be reusable and mostly presentational.
- Feature components may own behavior, but should expose clear props contracts.
- Use explicit loading, error, and empty states.
- Keep interaction logic readable: avoid deeply nested JSX conditionals when extraction improves clarity.
- Forms use `react-hook-form` + `zod` resolver; mutation is invoked from:
  - a typed Server Action (combination A)
  - a typed RTK Query mutation hook (combinations B and C)

### Component Separation Pattern
```tsx
// page.tsx (or route entry)
import FeatureContainer from "./FeatureContainer";

export default function Page() {
  return <FeatureContainer />;
}
```

### Combination A — `internal` + `server-actions`
```tsx
// FeatureContainer.tsx
import ItemsView from "./ItemsView";
import type { Item } from "@/types/<domain>";

export default async function FeatureContainer() {
  const items = await getItems(); // server/queries/* using Prisma
  return <ItemsView items={items} />;
}
```

### Combinations B and C — `rest-client`
```tsx
// FeatureContainer.tsx
"use client";

import { useGetItemsQuery } from "@/lib/api/endpoints/itemsApi";
import ItemsView from "./ItemsView";

export default function FeatureContainer() {
  const { data, isLoading, error } = useGetItemsQuery();
  return <ItemsView items={data ?? []} isLoading={isLoading} error={error} />;
}
```

## 4. Type Safety Rules
- Avoid `any` unless there is a deliberate temporary reason.
- Keep shared types in a dedicated location and re-export where needed.
- Treat API types as contracts; update all consumers when contracts change.
- Prefer explicit unions/enums for constrained values.
- **`rest-client`:** DTO types live in `src/lib/api/types.ts` and are imported by both endpoint modules and components. Keep field names identical to the backend serializer output.
- **`server-actions`:** types mirror the Prisma model and live in `src/types/<domain>.ts`.

## 5. Routing Rules
- Keep URL strategy consistent across the project (path segments vs query parameters).
- For nested resources, use nested/catch-all routes when supported by the framework.
- Keep navigation helpers centralized for path generation.
- **`rest-client` protected routes:** always sanitize the `?redirect=` query param via `sanitizeReturnPath()` to prevent open-redirect.

### Path Helper Pattern
```ts
export const buildEntityPath = (segments: string[]) => {
  const normalized = segments
    .map((s) => s.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return `/${normalized.join("/")}`;
};
```

## 6. Form and Mutation Rules
- Keep form state local to form components.
- Validate before mutation (zod resolver) and handle server errors explicitly.
- Use confirmation dialogs for destructive actions.
- Ensure post-mutation cache/state refresh is deterministic.
- **Combination A:** call the Server Action; `revalidatePath` inside the action refreshes dependent data.
- **Combinations B and C:** rely on the mutation's `invalidatesTags` to refresh dependent queries automatically; do not call `refetch()` manually.

## 7. Cross-Cutting Rules
- Centralize auth/session handling and permission checks.
  - **Combination A:** `src/server/auth.ts` exposes `auth()`; every Server Action and protected layout re-checks.
  - **Combinations B and C:** `src/lib/api/session.ts` owns token storage and `handleAuthFailure()`; `ProtectedRoute` + `useProtectedRoute` enforce on the client; protected layout does a server-side `/api/auth/me/` fetch for hard redirects.
- Keep theming/localization hooks reusable and framework-appropriate.
- Standardize feedback channels (toast, inline error, banners).
- Add logging/telemetry at important failure boundaries.
- **`rest-client`:** configure CORS once in the backend; the frontend assumes `NEXT_PUBLIC_API_URL` is reachable from the browser.

## 8. Data Layer Variant Comparison

| Concern | Combination A (`server-actions`) | Combinations B and C (`rest-client`) |
|---|---|---|
| ORM / data access (internal) | Prisma client singleton (`src/server/db.ts`) | Prisma client only inside Route Handlers (Combination C); none (Combination B) |
| Reads | RSC calls `src/server/queries/*` directly | RSC `fetch()` with tags, OR RTK Query hook from a client component |
| Writes | Server Actions in `src/server/actions/*` | RTK Query mutation hooks from `src/lib/api/endpoints/*` |
| Backend location | Same Next.js codebase | Combination C: same repo via Route Handlers · Combination B: separate repo |
| Auth | NextAuth session, server-checked | Bearer tokens in localStorage, axios interceptor-attached, refreshed on 401 |
| Cache invalidation | `revalidatePath` / `revalidateTag` inside the Server Action | `invalidatesTags` on the mutation endpoint; Route Handlers may additionally call `revalidatePath` / `revalidateTag` |
| Type sharing | Prisma models → TS types in `src/types/` | Backend serializer shapes → DTOs in `src/lib/api/types.ts` |
| Where Prisma/DB lives | `prisma/schema.prisma` | Combination C: same; Combination B: in external repo, not here |

> **The two axes are independent.** A full-stack Next.js codebase can still use a `rest-client` data layer (Combination C) — it just means the "backend" is implemented as Route Handlers instead of Server Actions.

## 9. Integrity

### Context & Navigation
- Do NOT read the whole project on every task.
- On first run: scan project structure → record in `architecture.md` which combination(s) are in use.
- On every subsequent run: read `architecture.md` for the map, read `context.md` for current task state.
- Only open a specific file if the current task explicitly requires it.
- After opening any new file, log it in `context.md`.

### Verification (DO NOT break the dev server)
- **Never run `next build` while a `next dev` server is running.** `next build` writes production artifacts to `.next/`, which is the same directory the dev server reads from — this corrupts the dev server's state and crashes it.
- Use `npx tsc --noEmit -p .` for type checking — it is read-only and never touches `.next/`.
- If a real production build is required to verify, ask the user first, or run it in a separate worktree.
- **Never run `rm -rf .next`** while the dev server is running (same reason).
- Before running any build/clean command, check whether `next dev` is in `ps aux` and stop if it is.

### Knowledge Update
- Any new structure, pattern, skill, or workflow applied → update `skills.md`, `architecture.md`, and `instructions.md`.