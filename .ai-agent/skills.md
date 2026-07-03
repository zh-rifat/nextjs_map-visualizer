# Universal Skills and Workflows

Reusable implementation playbooks for scalable feature work.

This codebase has **two orthogonal backend axes** that combine into three realistic architectures:
- **Backend source:** `internal` (Prisma + Server Actions / Route Handlers) | `external` (separate REST service)
- **Frontend data client:** `server-actions` | `rest-client` (Redux Toolkit Query + axios)

Each skill below is **combination-aware**: when behavior differs across combinations, the skill explicitly calls out which combination it applies to.

---

description: Universal implementation playbooks for scalable feature work

---

## 1. New Feature Workflow

1. Define the feature boundary and success criteria.
2. Add or update domain types/contracts (Prisma model for `internal`; DTO for `external`).
3. Implement data access:
   - **Combination A (`server-actions`):** Server Action for mutations; query helper in `src/server/queries/*` for reads.
   - **Combinations B and C (`rest-client`):** `injectEndpoints` module in `src/lib/api/endpoints/*` exposing query + mutation hooks with `providesTags` / `invalidatesTags`. Combination C additionally needs a Route Handler under `src/app/api/<resource>/route.ts`.
4. Build feature container and presentational components.
5. Integrate into routing/navigation.
6. Add loading/error/empty states and validation (zod).
7. Verify behavior with tests or runtime checks.

## 2. Data Contract Skill

Use when introducing or modifying backend-integrated entities.

Checklist:
- Define input/output types.
- Version/transition changes safely.
- Re-export shared types from canonical modules.
- Update all consumers in one pass.

Type locations by combination:
- **Combination A:** types mirror the Prisma model and live in `src/types/<domain>.ts`.
- **Combinations B and C:** DTOs are derived from backend serializer output and live in `src/lib/api/types.ts`; types are referenced by endpoint modules and components.

Snippet:
```ts
export type Entity = {
  id: string;
  name: string;
  status: "active" | "archived";
};

export type UpdateEntityPayload = Partial<Pick<Entity, "name" | "status">>;
```

## 3. API Integration Skill

Use when adding new endpoints or client operations.

### Combination A — Server Actions
- Add `src/server/actions/<domain>.ts` exporting typed async functions.
- Each action: checks auth → calls Prisma → calls `revalidatePath` for the public route and the admin route.
- Forms import the action directly and call it from `onSubmit`.

### Combinations B and C — RTK Query endpoint modules
- Add `src/lib/api/endpoints/<domain>Api.ts` extending `baseApi` via `injectEndpoints`.
- Place endpoint logic in feature-scoped modules (one file per backend domain).
- Define cache/update behavior explicitly with `providesTags` / `invalidatesTags`.
- Handle network and server failures predictably (return `{ error: { status, data } }` from `axiosBaseQuery`).
- Export ergonomic hooks (`useGetXQuery`, `useCreateXMutation`, etc.).
- Re-export hooks from the barrel `src/lib/api/endpoints/index.ts`.
- **Combination C only:** add the matching Route Handler under `src/app/api/<resource>/route.ts`. Keep its URL in sync with `baseApi.baseUrl`.

Snippet (combinations B and C):
```ts
const entitiesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getEntities: builder.query<Entity[], void>({
      query: () => ({ url: "entities", method: "GET" }),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: "Entity" as const, id })), { type: "Entity", id: "LIST" }]
          : [{ type: "Entity", id: "LIST" }],
    }),
    deleteEntity: builder.mutation<void, string>({
      query: (id) => ({ url: `entities/${id}/`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [{ type: "Entity", id }, { type: "Entity", id: "LIST" }],
    }),
  }),
});
```

## 4. Routing and Navigation Skill

Checklist:
- Keep URL strategy consistent (path-based or query-based by design).
- Use helper functions for link generation (`buildEntityPath`, `toFeaturePath`).
- Keep breadcrumbs/nav synchronized with route model.
- Preserve backward compatibility via redirects when migrating paths.
- **`rest-client` protected routes:** always sanitize the `?redirect=` query via `sanitizeReturnPath()` to prevent open-redirect.

Snippet:
```ts
export const toFeaturePath = (id: string) => `/feature/${encodeURIComponent(id)}`;
```

## 5. UI Composition Skill

Use when a page becomes complex or repeated patterns appear.

Checklist:
- Keep route/page component thin.
- Extract feature container for orchestration logic.
- Extract presentational components for visual layout.
- Keep props focused and typed.

Snippet:
```tsx
type ViewProps = {
  items: Entity[];
  isLoading: boolean;
  error?: unknown;
};

export function EntitiesView({ items, isLoading, error }: ViewProps) {
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Something went wrong.</div>;
  if (!items.length) return <div>No entities found.</div>;
  return <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>;
}
```

## 6. Forms and Mutation Skill

Use when implementing create/update/delete workflows.

Checklist:
- Keep form state local (`react-hook-form`).
- Validate before submit (`zodResolver`).
- Disable submit while pending (`formState.isSubmitting`).
- Show clear success/failure feedback (toast).
- Refresh cache/store after successful mutation.
  - **Combination A:** no manual refresh needed — `revalidatePath` inside the Server Action handles it.
  - **Combinations B and C:** declare `invalidatesTags` on the mutation; do not call `refetch()` manually.

## 7. Access and Security Skill

Use when feature behavior depends on identity, role, or permission.

### Combination A — NextAuth
- Centralize auth source in `src/server/auth.ts` (`auth()` helper).
- Guard protected routes in the protected layout with `auth()` + `redirect()`.
- Repeat the auth check inside every Server Action.
- Avoid exposing sensitive data in client logs.

### Combinations B and C — Bearer tokens + RTK Query
- Centralize token storage in `src/lib/api/session.ts` (`localStorage['auth']`).
- A single `axiosInstance` request interceptor attaches `Authorization: Bearer …`.
- A single response interceptor handles 401 → refresh → replay; on refresh failure → `handleAuthFailure()`.
- `ProtectedRoute` component and `useProtectedRoute` hook enforce on the client.
- The protected layout does a server-side fetch to `/api/auth/me/` for hard redirects.
- Handle expired sessions gracefully (`handleAuthFailure` redirects to `/login?redirect=…`).
- **Combination C only:** Route Handlers verify the token themselves (NextAuth session OR JWT verification) before touching Prisma.

## 8. Observability and Resilience Skill

Use when stabilizing production behavior.

Checklist:
- Add structured logs for failure paths (server-side in all combinations; client-side in `rest-client` via the axios response interceptor).
- Capture actionable error context.
- Add retry/backoff where appropriate (`rest-client`: 401 is already retried via the JWT refresh interceptor).
- Add graceful fallback UI for recoverable failures (loading / error / empty states in every view).

## 9. Data Layer Skill

Use when adding or changing data flows.

### Combination A — Prisma + Server Actions
- Read data in RSC routes via `src/server/queries/*` helpers.
- Write data via `src/server/actions/*` with auth checks and `revalidatePath`.
- Keep Prisma access inside `src/server/` only.

### Combination B — External REST + RTK Query
- Read data in client components via RTK Query hooks from `src/lib/api/endpoints/*`.
- Read data in RSC via `fetch()` with `next: { tags: [...] }`; trigger `revalidateTag()` from a Server Action wrapper when needed.
- Write data via mutation hooks; declare `invalidatesTags` so dependent queries refresh automatically.
- Never bypass the shared `axiosInstance` with a direct `fetch()` from a component.
- Never create a second axios instance or baseApi — always extend via `injectEndpoints`.

### Combination C — Next.js Route Handlers + RTK Query
- Same rules as Combination B, plus:
  - Each Route Handler under `src/app/api/<resource>/route.ts` does its own auth check, calls Prisma, and calls `revalidatePath` / `revalidateTag` so RSC pages also update.
  - Keep `baseApi.baseUrl` and the Route Handler URL paths in sync.

## 10. Backend-Agnostic Frontend Skill

Use when picking, switching, or extending the backend combination.

The architecture has **two orthogonal axes**:
- **Backend source:** `internal` (Next.js codebase) | `external` (separate repo/service)
- **Frontend data client:** `server-actions` | `rest-client` (RTK Query)

Checklist:
- Frontend invariants (folder structure, feature boundaries, routing, UI composition) are identical across all combinations.
- Only the **data layer directory** changes:
  - `server-actions` projects use `src/server/{queries,actions}/`.
  - `rest-client` projects use `src/lib/api/{baseApi,axiosInstance,endpoints}/` + `src/lib/slices/` + `src/lib/store.ts`.
  - Combination C additionally uses `src/app/api/<resource>/route.ts`.
- Type contracts:
  - `internal` (Prisma) → `src/types/<domain>.ts` for Server Actions, OR `src/lib/api/types.ts` DTOs for Route Handlers (Combination C).
  - `external` → `src/lib/api/types.ts` DTOs, imported by endpoint modules and components.
- Cross-cutting invariants: folder structure, feature boundaries, routing, UI composition.

## 11. Maintenance Skill

Whenever a reusable pattern is introduced or changed:
1. Update `.ai-agent/architecture.md` with the structural rationale.
2. Update `.ai-agent/instructions.md` with implementation rules.
3. Update `.ai-agent/skills.md` with step-by-step workflow.

## 12. Integrity

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