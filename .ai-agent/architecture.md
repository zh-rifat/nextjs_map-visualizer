# Codebase Architecture

## Purpose

This document defines the architecture for a **Next.js** application whose **backend is intentionally swappable**. Two orthogonal axes control the data layer:

1. **Where the backend lives** — *backend source*
   - `internal` — same Next.js codebase (Prisma + Route Handlers / Server Actions)
   - `external` — a separate REST service (Django REST, Express, NestJS, Go, …)

2. **How the frontend calls it** — *frontend data client*
   - `server-actions` — Next.js Server Actions / `server/queries/*` helpers
   - `rest-client` — Redux Toolkit Query backed by a shared `axios` instance

Each axis is independent. A project picks one option from each axis. The three realistic combinations are:

| Combination | Backend source | Frontend data client | When to use it |
|---|---|---|---|
| **A. Pure full-stack Next.js** | `internal` (Prisma) | `server-actions` | Solo project, no separate backend team, prefer server-side cache invalidation |
| **B. Next.js + external REST** | `external` (Django, etc.) | `rest-client` (RTK Query) | Backend lives in another repo/service |
| **C. Next.js internal API + RTK Query** | `internal` (Next.js Route Handlers) | `rest-client` (RTK Query) | One Next.js codebase, but REST-shaped data layer (mirror backend conventions, future-extract, share API contracts) |

A single set of frontend principles (folder structure, feature boundaries, routing, UI composition, cross-cutting concerns) applies to all combinations. Only the **data layer** and **auth layer** change.

---

## Stack

### Frontend (shared across all combinations)
- **Framework:** Next.js 16 (App Router) · TypeScript
- **State:** Redux Toolkit + React-Redux (for RTK Query cache and global UI state)
- **Forms:** react-hook-form + zod
- **Styling:** Tailwind CSS + CSS Modules
- **Animation:** Framer Motion (or other — choose per project)

### Backend source — `internal`
- **Database:** PostgreSQL + Prisma ORM (typical)
- **Server-side API:** Next.js Server Actions **and/or** Route Handlers under `src/app/api/*`
- **Auth:** NextAuth.js (typical) when using Server Actions; cookies/JWT when using Route Handlers
- **Cache invalidation:** `revalidatePath` / `revalidateTag`

### Backend source — `external`
- **API style:** REST over HTTP (JSON). Any backend — Django REST Framework, Express, NestJS, Go, etc.
- **CORS:** Backend must whitelist the Next.js origin(s)
- **Auth:** Backend issues auth tokens (Bearer JWT, session, etc.); Next.js attaches them via its data client

### Frontend data client — `server-actions`
- Reads: RSC calls `server/queries/*` helpers which use Prisma directly (or `fetch()` to the Next.js or external API)
- Writes: Server Actions in `server/actions/*` with `"use server"` + auth check
- **No RTK Query needed for backend data** — only for UI/global state if desired

### Frontend data client — `rest-client`
- **One** `axiosInstance` with request interceptor (attach `Authorization`) and response interceptor (refresh on 401 → replay once)
- **One** `baseApi = createApi({ baseQuery: axiosBaseQuery({ baseUrl }) })` with exhaustive `tagTypes`
- **One** `injectEndpoints` module per backend domain in `lib/api/endpoints/*`
- Cache invalidation via `providesTags` / `invalidatesTags`
- RSC reads also possible via `fetch(API_URL + path, { next: { tags: [...] } })` + `revalidateTag` from a Server Action wrapper

---

## Core Principles (apply to all combinations)

- Separation of concerns across routing, UI, domain logic, and data access.
- Single source of truth for shared state and backend synchronization.
- Feature-oriented composition: each feature owns its UI, state contracts, and API surface.
- Strong typing and explicit contracts between layers — **including across the network boundary** when using the `rest-client` data client.
- Reusability first for shared primitives; locality first for feature-specific logic.
- **The frontend data layer is the only thing that changes between combinations.** UI, features, routing, and cross-cutting concerns are invariant.

---

## Recommended Top-Level Structure

The frontend is laid out identically regardless of combination. The backend layout (if any) is the only thing that changes.

### Combination A — `internal` + `server-actions` (pure full-stack Next.js)

```text
/
├── prisma/
│   ├── schema.prisma          # DB models
│   └── seed.ts                # Optional seed script
│
└── src/
    ├── app/                   # Next.js App Router — pages, layouts, routing
    │   ├── api/
    │   │   └── auth/[...nextauth]/route.ts
    │   ├── globals.css
    │   └── layout.tsx
    ├── server/                # Server-only: DB access, auth, mutations
    │   ├── db.ts              # Prisma client singleton
    │   ├── auth.ts            # NextAuth config
    │   ├── queries/
    │   │   └── *.ts           # One query helper per domain
    │   └── actions/           # Next.js Server Actions
    │       └── *.ts           # One action module per domain
    ├── lib/                   # Utilities, configurations
    │   ├── constants.ts
    │   ├── store.ts           # Redux store (still useful for global UI state)
    │   └── utils.ts
    └── types/
        ├── *.ts               # One domain type module
        └── next-auth.d.ts
```

### Combination B — `external` + `rest-client` (Next.js + Django REST + RTK Query)

```text
/
├── backend/                   # ← separate backend service
│   ├── manage.py             # Django entrypoint (example)
│   ├── requirements.txt
│   └── <project>/
│       ├── settings.py
│       ├── urls.py
│       └── <apps>/
│           ├── models.py
│           ├── serializers.py
│           ├── views.py
│           ├── urls.py
│           └── permissions.py
│
└── src/                       # Next.js frontend
    ├── app/
    │   ├── globals.css
    │   └── layout.tsx        # wraps <ReduxProvider>
    ├── lib/
    │   ├── api/              # ← all REST plumbing lives here
    │   │   ├── baseApi.ts            # RTK Query createApi (no endpoints)
    │   │   ├── axiosBaseQuery.ts     # adapter: RTK Query ↔ axios
    │   │   ├── axiosInstance.ts      # singleton axios + JWT interceptors
    │   │   ├── configs.ts            # NEXT_PUBLIC_API_URL resolution
    │   │   ├── session.ts            # localStorage helpers + handleAuthFailure
    │   │   ├── endpoints/            # one injectEndpoints module per backend domain
    │   │   │   ├── <domain1>Api.ts
    │   │   │   ├── <domain2>Api.ts
    │   │   │   └── index.ts          # barrel re-export of all hooks
    │   │   └── types.ts              # request/response DTOs
    │   ├── store.ts          # configureStore({ reducer: { api: baseApi.reducer, auth, ui } })
    │   ├── slices/
    │   │   ├── authSlice.ts # tokens + current user (NOT data — data is in RTK Query cache)
    │   │   └── uiSlice.ts   # toasts, modals, theme
    │   ├── hooks/
    │   │   ├── useAuthenticate.ts    # canonical "store tokens after login"
    │   │   └── useProtectedRoute.ts
    │   └── utils.ts
    ├── server/               # OPTIONAL: thin SSR data fetchers (RSC)
    │   └── queries/
    │       └── *.ts          # calls API_URL with NEXT_PUBLIC_* or SERVER_ACCESS_TOKEN
    ├── features/             # screen-level feature components
    │   └── <feature>/
    └── types/
        └── *.ts
```

### Combination C — `internal` + `rest-client` (Next.js internal API + RTK Query)

Identical frontend to **Combination B** (`lib/api/`, `lib/slices/`, `lib/store.ts`, `lib/api/endpoints/*`). The differences:

- No `backend/` directory.
- `NEXT_PUBLIC_API_URL` points to the Next.js origin itself (e.g. `http://localhost:3000/api`).
- The "backend" is implemented as **Next.js Route Handlers** under `src/app/api/<resource>/route.ts` instead of a separate service. These route handlers read/write Prisma directly (no `server/actions/*`).
- Auth is handled in the Route Handlers (e.g. via NextAuth `auth()` helper, or via a JWT middleware).

```text
src/app/api/
├── auth/
│   ├── login/route.ts          # POST: issues JWT
│   ├── logout/route.ts
│   └── me/route.ts             # GET: returns current user
├── <domain1>/
│   ├── route.ts                # GET (list), POST (create)
│   └── [id]/route.ts           # GET, PATCH, DELETE
└── <domain2>/route.ts
```

> **Why choose C over A?** Same deployment simplicity as A, but the frontend treats the backend as a REST API. Useful when you want to (a) eventually extract the backend into a separate service, (b) share API contracts with another team, or (c) keep server-actions out of your React components in favor of typed mutation hooks. Trade-off: more boilerplate, two layers (Route Handler + endpoint module) instead of one (Server Action).

---

## Architectural Layers

### 1. Entry and Routing Layer
Responsibilities:
- URL structure and navigation boundaries.
- Route-level data preloading where supported.
- Page-level error, loading, and access control boundaries.
- Server-side auth check in protected layouts — redirect before render, no client flicker.

Rule:
- Keep route files orchestrative. Move complex rendering and logic into feature components.
- Pages should be React Server Components (RSC) where possible — fetch data at render time, no client spinner.

### 2. UI Layer
Responsibilities:
- Shared, composable presentational components (`components/ui/`).
- Consistent design tokens and interaction patterns.
- Accessibility and responsive behavior.

Rule:
- Shared components should be domain-neutral.
- Domain-specific UI belongs near the feature that owns it.

### 3. Feature Layer
Responsibilities:
- Domain workflows.
- Feature-specific state, forms, validators, and interactions.
- Command registries / domain orchestration as needed.

Rule:
- A feature should be understandable in isolation.

### 4. Data Layer — `server-actions` (Combination A)

Responsibilities:
- Prisma client singleton and all database access (`server/db.ts`).
- NextAuth configuration (`server/auth.ts`).
- Server Actions for all mutations (`server/actions/*.ts`).
- `revalidatePath` called after every mutation to bust dependent caches.

Rule:
- No database access outside `server/`. Components and features never import Prisma directly.
- Every Server Action re-validates both the public page and the relevant admin route.
- Auth check is repeated inside every Server Action.

### 4. Data Layer — `rest-client` (Combinations B and C)

Responsibilities:
- One `axiosInstance` for the whole app — request interceptor attaches `Authorization: Bearer …`; response interceptor refreshes on 401 and replays the request once.
- One `baseApi = createApi({ baseQuery: axiosBaseQuery({ baseUrl }) })` with exhaustive `tagTypes`.
- One `injectEndpoints` module per backend domain (`endpoints/<domain>Api.ts`, …).
- Endpoint definitions declare `providesTags` for reads and `invalidatesTags` for writes — **this is the only cache invalidation mechanism** when using the `rest-client`.
- RSC reads via `fetch(API_URL + path, { next: { tags: [...] } })` and revalidation triggers via Server Actions that call `revalidateTag`.

Rule:
- **Never create a second axios instance.** Everything goes through `lib/api/axiosInstance.ts`.
- **Never `fetch()` directly from a component.** Use the RTK Query hook from `endpoints/*`.
- Token storage is one canonical place (`lib/api/session.ts`) — never read `localStorage.getItem('auth')` from a component.
- Endpoints declare `providesTags` / `invalidatesTags` so the cache stays correct without manual refetching.
- Mutations return the updated entity when the caller needs the new shape (avoid round-trips).

#### Base client pattern (`rest-client`)

```ts
// lib/api/axiosBaseQuery.ts
import type { BaseQueryFn } from '@reduxjs/toolkit/query/react';
import axios_instance from './axiosInstance';
import type { AxiosError } from 'axios';

const axiosBaseQuery =
  ({ baseUrl = '' }: { baseUrl?: string } = {}): BaseQueryFn =>
  async ({ url, method = 'GET', data, params, headers, skipAuth }) => {
    try {
      const result = await axios_instance({ url: `${baseUrl}${url}`, method, data, params, headers, skipAuth });
      return { data: result.data };
    } catch (rawError) {
      const error = rawError as AxiosError;
      return { error: { status: error.response?.status ?? 500, data: error.response?.data ?? error.message } };
    }
  };

export default axiosBaseQuery;
```

```ts
// lib/api/baseApi.ts
import { createApi } from '@reduxjs/toolkit/query/react';
import axiosBaseQuery from './axiosBaseQuery';

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery({ baseUrl: '/api/' }),
  tagTypes: [
    'Auth',
    '<Domain1>', '<Domain2>',
    // exhaustive list of every tag any endpoint provides or invalidates
  ],
  endpoints: () => ({}),
});
```

```ts
// lib/api/endpoints/<domain>Api.ts
import { baseApi } from '../baseApi';

type Entity = { id: string; name: string /* ... */ };

export const <domain>Api = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listEntities: builder.query<Entity[], void>({
      query: () => ({ url: '<domain>/', method: 'GET' }),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: '<Domain>' as const, id })), { type: '<Domain>', id: 'LIST' }]
          : [{ type: '<Domain>', id: 'LIST' }],
    }),
    getEntity: builder.query<Entity, string>({
      query: (id) => ({ url: `<domain>/${id}/`, method: 'GET' }),
      providesTags: (_r, _e, id) => [{ type: '<Domain>', id }],
    }),
    createEntity: builder.mutation<Entity, Partial<Entity>>({
      query: (data) => ({ url: '<domain>/', method: 'POST', data }),
      invalidatesTags: [{ type: '<Domain>', id: 'LIST' }],
    }),
    updateEntity: builder.mutation<Entity, { id: string; data: Partial<Entity> }>({
      query: ({ id, data }) => ({ url: `<domain>/${id}/`, method: 'PATCH', data }),
      invalidatesTags: (_r, _e, { id }) => [{ type: '<Domain>', id }, { type: '<Domain>', id: 'LIST' }],
    }),
    deleteEntity: builder.mutation<void, string>({
      query: (id) => ({ url: `<domain>/${id}/`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [{ type: '<Domain>', id }, { type: '<Domain>', id: 'LIST' }],
    }),
  }),
});

export const {
  useListEntitiesQuery,
  useGetEntityQuery,
  useCreateEntityMutation,
  useUpdateEntityMutation,
  useDeleteEntityMutation,
} = <domain>Api;
```

### 5. State Layer
Responsibilities:
- Typed data models as the single source of truth for data shape.
- Global client state limited to:
  - **All combinations:** feature-specific UI state as needed (e.g. command registries, ephemeral UI flags).
  - **`rest-client` only:** auth tokens + current user, **plus** RTK Query cache for backend data.
- No API client library beyond Redux Toolkit Query when using `rest-client`.

Rule:
- Keep request logic out of presentational components.
- Client state is ephemeral UI state only. Persistent data lives in the database (internal) or behind the REST API (external).

---

## Feature Domains (generic patterns)

### Identity and Access (Auth)

#### Combination A — NextAuth credentials
- Credentials-based sign-in via NextAuth.
- Server-side session check in protected layouts — hard redirect, no client-side guards.
- Auth repeated inside every Server Action as a second check.

#### Combinations B and C — Bearer tokens from a REST API
- Login form posts to `/api/auth/login/` (or equivalent) → backend returns `{access_token, refresh_token}` (and optionally user).
- Tokens stored in `localStorage['auth'] = JSON.stringify({user, tokens})` via `lib/api/session.ts`.
- A single `axiosInstance` request interceptor attaches `Authorization: Bearer <access>`.
- A single response interceptor catches 401, calls `/api/auth/token/refresh/`, updates localStorage, replays the original request once. On refresh failure → `handleAuthFailure()` clears localStorage and redirects to `/login?redirect=<current-path>`.
- `ProtectedRoute` component and `useProtectedRoute` hook guard protected pages client-side. RSC layouts additionally verify the token by calling `/api/auth/me/` server-side (with the `SERVER_ACCESS_TOKEN` env var or via forwarded cookies) so redirects happen before render.

### Public Content (Read)
- Public-facing data is fetched at render time.
- **`server-actions`:** Prisma in RSC.
- **`rest-client`:** RTK Query hook OR `fetch(API_URL + path, { next: { tags: [...] } })` in RSC.
- Two render modes (where applicable) can share the same data via typed props.

### Admin / Backoffice (Write)
- CRUD for each domain entity.
- **`server-actions` (Combination A):** mutations via Server Actions — no dedicated API routes. `revalidatePath` inside each action.
- **`rest-client` (Combinations B and C):** mutations via RTK Query mutation hooks generated from `endpoints/*`. Each mutation declares `invalidatesTags` so the cache refreshes automatically. For Combination C, the underlying Route Handler still revalidates the Next.js cache via `revalidatePath` / `revalidateTag` so RSC pages also update.
- Forms: controlled inputs (react-hook-form), zod validation, confirmation on delete.

### Cross-Cutting Platform Concerns
- Themed via CSS variables in the relevant layout(s).
- Error boundaries at route level.
- Logging/telemetry at important failure boundaries.

---

## Responsibility Flow Pattern

### Combination A — Public Read
```text
app/<route>/page.tsx  [RSC]
  -> Prisma query (direct, server-side) via src/server/queries/*
    -> FeatureContainer(data)  [server or client component]
      -> <Feature>View  [presentational]
```

### Combination A — Admin Mutation (Write)
```text
Admin form submit
  -> Server Action  [src/server/actions/*.ts]
    -> auth() check
      -> db.model.update()  [Prisma]
        -> revalidatePath("/<public-route>")  +  revalidatePath("/<admin-route>")
          -> Public RSC re-renders with fresh data
```

### Combinations B and C — Public Read via `rest-client`
```text
app/<route>/page.tsx  [RSC]
  -> fetch(API_URL + '/<path>/', { next: { tags: ['<tag>'] } })
    -> FeatureContainer(data)  [server or client component]
      -> <Feature>View  [presentational]
```

### Combinations B and C — Admin Mutation (Write via `rest-client`)
```text
Admin form submit
  -> useUpdateEntityMutation()  [RTK Query hook]
    -> axios_instance.patch('/api/<domain>/<id>/', data)
      -> JWT interceptor attaches Authorization header
        -> backend returns updated Entity
          -> RTK Query invalidatesTags ['<Domain>', '<Domain>:LIST']
            -> any component using useListEntitiesQuery refetches automatically
            -> Combination C: Route Handler also calls revalidateTag('<tag>')
              -> Public RSC re-renders with fresh data on next navigation
```

---

## Database Schema (Combination A — Prisma)

The frontend does not own this schema in combinations B and C with an external backend. For `internal` backends, the schema lives in `prisma/schema.prisma` of this repo (Combinations A and C); the frontend only sees the serializer/REST DTO shapes in Combination C.

A generic schema sketch (replace with your domain):

```prisma
model Entity {
  id        String   @id @default(cuid())
  name      String
  // domain-specific fields
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

> Keep field names identical to the API output to avoid translation layers.

---

## File-Level Boundary Examples

### Public Page — Combination A (RSC reads Prisma directly)
```tsx
// app/(public)/<route>/page.tsx
import { FeatureShell } from "@/components/<feature>/FeatureShell"
import { getEntities } from "@/server/queries/<domain>"

export default async function Page() {
  const data = await getEntities()
  return <FeatureShell data={data} />
}
```

### Public Page — Combinations B and C (RSC fetches REST)
```tsx
// app/(public)/<route>/page.tsx
import { FeatureShell } from "@/components/<feature>/FeatureShell"

export default async function Page() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/<path>/`, {
    next: { tags: ['<tag>'], revalidate: 3600 },
    headers: { Authorization: `Bearer ${process.env.SERVER_ACCESS_TOKEN ?? ''}` },
  })
  if (!res.ok) throw new Error('Failed to load data')
  const data = await res.json()
  return <FeatureShell data={data} />
}
```

### Protected Layout — Combination A (NextAuth session check)
```tsx
// app/(protected)/layout.tsx
import { auth } from "@/server/auth"
import { redirect } from "next/navigation"

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")
  return <>{children}</>
}
```

### Protected Layout — Combinations B and C (token check via backend)
```tsx
// app/(protected)/layout.tsx
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get('access_token')?.value
  if (!token) redirect('/login?redirect=/<protected>')

  // Verify token by calling backend; server-side fetch reuses SERVER_ACCESS_TOKEN if present
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me/`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) redirect('/login?redirect=/<protected>')

  return <>{children}</>
}
```

### Admin Mutation — Combination A (Server Action)
```ts
// src/server/actions/<domain>.ts
"use server"

import { db } from "@/server/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/server/auth"

export async function updateEntity(id: string, data: EntityUpdateInput) {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await db.entity.update({ where: { id }, data })
  revalidatePath("/<public-route>")
  revalidatePath("/<admin-route>")
}
```

### Admin Mutation — Combinations B and C (RTK Query hook from a form)
```tsx
// features/<feature>/<domain>/EditEntityForm.tsx
"use client"

import { FormProvider, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useUpdateEntityMutation } from "@/lib/api/endpoints/<domain>Api"

const schema = z.object({ name: z.string().min(1), /* ... */ })
type FormValues = z.infer<typeof schema>

export function EditEntityForm({ id, initial }: { id: string; initial: FormValues }) {
  const methods = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initial })
  const [update, { isLoading, error }] = useUpdateEntityMutation()

  const onSubmit = methods.handleSubmit(async (values) => {
    try {
      await update({ id, data: values }).unwrap()
      // RTK Query already invalidated '<Domain>' + '<Domain>:LIST' tags
    } catch (e) {
      // surface error via toast
    }
  })

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit}>{/* fields */}</form>
    </FormProvider>
  )
}
```

### Admin Mutation — Combination C (Route Handler backing the RTK Query hook)
```ts
// src/app/api/<domain>/[id]/route.ts
import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { db } from '@/server/db'
import { auth } from '@/server/auth' // NextAuth helper, or JWT verification

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const data = await req.json()
  const entity = await db.entity.update({ where: { id: params.id }, data })

  revalidatePath('/<public-route>')
  revalidateTag('<tag>')

  return NextResponse.json(entity)
}
```

---

## Scaling Rules
- Promote patterns to shared docs only after at least two real usages.
- Prefer additive evolution over large rewrites.
- Keep architecture docs synced whenever introducing a new cross-cutting pattern.
- Each new domain entity follows the same pattern: data model → endpoint / server action / route handler → RSC fetch → feature UI.
- **`rest-client` only:** when adding a new endpoint module, declare its `providesTags` and `invalidatesTags` on the same day — never ship an endpoint that leaves the cache stale.
- **Combination C only:** keep Route Handler URLs and `baseApi.baseUrl` in sync. A change to one must propagate to the other.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Backend source × data client are orthogonal axes | A full-stack Next.js codebase can still use a REST-shaped data layer (Combination C) — backend location and client style are independent choices |
| Document all three realistic combinations in one doc | Keeps shared frontend invariants (folder structure, routing, UI composition) visible in a single place; only data + auth layers change between combinations |
| Single `axiosInstance` for the whole app (`rest-client`) | One auth-refresh pipeline, no duplicated interceptor logic |
| RTK Query `injectEndpoints` per backend domain | Keeps endpoint modules cohesive; barrel re-export hides internal layout |
| Tag-based invalidation over manual refetch | Cache stays correct without imperative `refetch()` calls scattered across forms |
| `lib/api/session.ts` owns token storage | Components never read `localStorage.getItem('auth')` directly |
| Single `baseApi` with exhaustive `tagTypes` | Strict-typed cache invalidation across all endpoints |
| **Backend-stack-agnostic frontend** (Combination B) | The same Next.js app can target any REST backend (Django, Express, NestJS, Go, …) by swapping `lib/api/endpoints/*` |
| Combination C: Next.js Route Handlers as the REST layer | Lets you stay in one repo while still using RTK Query + REST contracts; easy to extract the route handlers into a separate service later |
| Server Actions over API routes (Combination A) | Auth co-located with mutation, automatic cache revalidation, less boilerplate |
| RSC for public pages | Zero client JS for data fetching — pages render with pre-loaded data |
| Slug/ID-based routing for resources | Stable identifier that maps cleanly to API paths and command inputs |