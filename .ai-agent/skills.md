# Universal Skills and Workflows

This file provides project-agnostic implementation playbooks that can be reused across domains and stacks.

---
description: Universal implementation playbooks for scalable feature work
---

## 1. New Feature Workflow

1. Define the feature boundary and success criteria.
2. Add or update domain types/contracts.
3. Implement data access (query/mutation/client calls).
4. Build feature container and presentational components.
5. Integrate into routing/navigation.
6. Add loading/error/empty states and validation.
7. Verify behavior with tests or runtime checks.

## 2. Data Contract Skill
Use when introducing or modifying backend-integrated entities.

Checklist:
- Define input/output types.
- Version/transition API changes safely.
- Re-export shared types from canonical modules.
- Update all consumers in one pass.

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

Checklist:
- Place endpoint logic in feature-scoped API modules.
- Define cache/update behavior explicitly.
- Handle network and server failures predictably.
- Export ergonomic hooks/functions.

Snippet:
```ts
const entitiesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getEntities: builder.query<Entity[], void>({
      query: () => ({ url: "entities", method: "GET" }),
      providesTags: [{ type: "Entities", id: "LIST" }],
    }),
    deleteEntity: builder.mutation<void, string>({
      query: (id) => ({ url: `entities/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Entities", id: "LIST" }],
    }),
  }),
});
```

## 4. Routing and Navigation Skill
Use when creating pages, nested routes, or route migrations.

Checklist:
- Keep URL strategy consistent (path-based or query-based by design).
- Use helper functions for link generation.
- Keep breadcrumbs/nav synchronized with route model.
- Preserve backward compatibility via redirects when migrating paths.

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
  if (!items.length) return <div>No items found.</div>;
  return <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>;
}
```

## 6. Forms and Mutation Skill
Use when implementing create/update/delete workflows.

Checklist:
- Keep form state local.
- Validate before submit.
- Disable submit while pending.
- Show clear success/failure feedback.
- Refresh cache/store after successful mutation.

## 7. Access and Security Skill
Use when feature behavior depends on identity, role, or permission.

Checklist:
- Centralize auth/session source of truth.
- Guard protected routes and actions.
- Avoid exposing sensitive data in client logs.
- Handle expired sessions gracefully.

## 8. Observability and Resilience Skill
Use when stabilizing production behavior.

Checklist:
- Add structured logs for failure paths.
- Capture actionable error context.
- Add retry/backoff where appropriate.
- Add graceful fallback UI for recoverable failures.

## 9. Server Actions + Queries Skill
Use when adding or changing portfolio data flows in this codebase.

Checklist:
- Read data in RSC routes via `server/queries/*` helpers.
- Write data via `server/actions/*` with auth checks and `revalidatePath`.
- Keep Prisma access inside `server/` only.

## 10. Maintenance Skill
Whenever a reusable pattern is introduced or changed:
1. Update `.ai-agent/architecture.md` with the structural rationale.
2. Update `.ai-agent/instructions.md` with implementation rules.
3. Update `.ai-agent/skills.md` with step-by-step workflow.
