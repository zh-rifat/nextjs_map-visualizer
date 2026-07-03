# Universal Implementation Instructions

## Goal
This file defines domain-agnostic coding instructions that can be applied to any project type.

## 1. Structural Rules
- Keep route/page files focused on composition and wiring.
- Move domain-heavy logic into feature modules or dedicated components.
- Keep shared primitives in a central location (`components/`, `lib/`, `types/`).
- Prefer predictable folder conventions over one-off structures.
- NOTE: the architecture is a generic type of so do it based on the project type
## 2. Data Layer Rules
- Use a shared API client base configuration (base URL, auth headers, error handling).
- Group endpoints by feature/domain.
- Export strongly typed query and mutation hooks/functions.
- Define cache behavior intentionally (keys/tags/invalidation strategy).

### Minimal Endpoint Pattern
```ts
import { baseApi } from "@/lib/api/baseApi";

type Item = { id: string; name: string };

type CreateItemPayload = { name: string };

export const itemsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getItems: builder.query<Item[], void>({
      query: () => ({ url: "items", method: "GET" }),
      providesTags: [{ type: "Items", id: "LIST" }],
    }),
    createItem: builder.mutation<Item, CreateItemPayload>({
      query: (data) => ({ url: "items", method: "POST", data }),
      invalidatesTags: [{ type: "Items", id: "LIST" }],
    }),
  }),
});

export const { useGetItemsQuery, useCreateItemMutation } = itemsApi;
```

## 3. UI and Component Rules
- Shared components should be reusable and mostly presentational.
- Feature components may own behavior, but should expose clear props contracts.
- Use explicit loading, error, and empty states.
- Keep interaction logic readable: avoid deeply nested JSX conditionals when extraction improves clarity.

### Component Separation Pattern
```tsx
// page.tsx (or route entry)
import FeatureContainer from "./FeatureContainer";

export default function Page() {
  return <FeatureContainer />;
}
```

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

## 5. Routing Rules
- Keep URL strategy consistent across the project (path segments vs query parameters).
- For nested resources, use nested/catch-all routes when supported by the framework.
- Keep navigation helpers centralized for path generation.

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
- Validate before mutation and handle server errors explicitly.
- Use confirmation dialogs for destructive actions.
- Ensure post-mutation cache/state refresh is deterministic.

## 7. Cross-Cutting Rules
- Centralize auth/session handling and permission checks.
- Keep theming/localization hooks reusable and framework-appropriate.
- Standardize feedback channels (toast, inline error, banners).
- Add logging/telemetry at important failure boundaries.

## 8. Server Actions + Queries (Project-Specific)
- Fetch portfolio data in RSC routes via `server/queries/*` helpers.
- Route all mutations through `server/actions/*` and call `revalidatePath` for `/` and the related admin page.
- Never access Prisma outside `server/`.

## 9. Maintenance Rule
Whenever you introduce a new reusable structure, workflow, or pattern, update all three docs together:
- `.ai-agent/architecture.md`
- `.ai-agent/instructions.md`
- `.ai-agent/skills.md`

- Do not read whole codebase each time; keep contexts in context.md and use it during the workflow
- Do not run the project of your own;ask me to run if needed 
