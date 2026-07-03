# Portfolio Codebase Architecture

## Purpose
This document defines the architecture for a personal portfolio website with an OS-inspired terminal interface (MS-DOS / Linux Hyprland aesthetic) and an admin-only content management panel. Built as a full-stack Next.js application with PostgreSQL and Prisma ORM.

## Stack
- **Framework:** Next.js 16 (App Router) · TypeScript
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** NextAuth.js (admin-only, credentials-based)
- **Styling:** Tailwind CSS + CSS Modules
- **Animation:** Framer Motion (boot sequence, window transitions)

## Core Principles
- Separation of concerns across routing, UI, domain logic, and data access.
- Single source of truth for shared state and backend synchronization.
- Feature-oriented composition: each feature owns its UI, state contracts, and API surface.
- Strong typing and explicit contracts between layers.
- Reusability first for shared primitives; locality first for feature-specific logic.

## Recommended Top-Level Structure

```text
/
├── prisma/
│   ├── schema.prisma          # DB models: Project, Skill, Experience, AdminUser
│   └── seed.ts                # Seed from data.md
│
└── src/
    ├── app/                   # Next.js App Router — pages, layouts, routing
    │   ├── api/
    │   │   └── auth/[...nextauth]/route.ts
    │   ├── globals.css        # Global Tailwind and base styles
    │   └── layout.tsx         # Root layout wrapping the entire application
    ├── server/                # Server-only: DB access, auth, mutations
    │   ├── db.ts              # Prisma client singleton
    │   ├── auth.ts            # NextAuth config, admin-only credentials strategy
    │   ├── queries/
    │   │   └── portfolio.ts   # Fetch portfolio data for RSC
    │   └── actions/           # Next.js Server Actions (no API routes needed)
    │       ├── profile.ts     # updateProfile, current work CRUD
    │       ├── projects.ts    # createProject, updateProject, deleteProject
    │       ├── skills.ts
    │       └── experience.ts
    ├── lib/                   # Utilities, configurations, core services
    │   ├── constants.ts       # Boot text, prompt string, OS version string
    │   └── utils.ts
    └── types/                 # Shared TypeScript models and definitions
        ├── terminal.ts        # OutputLine, Command, FSNode
        ├── portfolio.ts       # Project, Skill, Experience (mirrors Prisma models)
        └── next-auth.d.ts     # Session type augmentation
```

## Architectural Layers

### 1. Entry and Routing Layer
Responsibilities:
- URL structure and navigation boundaries.
- Route-level data preloading where supported.
- Page-level error, loading, and access control boundaries.
- Server-side auth check in admin layout — redirect before render, no client flicker.

Rule:
- Keep route files orchestrative. Move complex rendering and logic into feature components.
- Portfolio pages are React Server Components — fetch Prisma data directly, no client fetch or loading spinner.

### 2. UI Layer
Responsibilities:
- Shared, composable presentational components.
- Consistent design tokens and interaction patterns.
- Accessibility and responsive behavior.
- Two distinct UI modes: terminal (DOS) and tiling window manager (Hyprland). Mode toggled via `gui` / `terminal` commands.

Rule:
- Shared components should be domain-neutral.
- Domain-specific UI (terminal output cards, window panels, admin forms) belongs near the feature that owns it.

### 3. Feature Layer
Responsibilities:
- Domain workflows: terminal command handling, window management, admin CRUD.
- Feature-specific state, forms, validators, and interactions.
- Virtual filesystem construction from DB data at runtime.
- Command registry mapping typed commands to handlers.

Rule:
- A feature should be understandable in isolation.
- The terminal feature receives pre-fetched portfolio data as props and builds the virtual FS client-side — no additional fetching.

### 4. Server Layer
Responsibilities:
- Prisma client singleton and all database access.
- NextAuth configuration — credentials-only, single admin user.
- Server Actions for all mutations (create, update, delete).
- `revalidatePath` called after every mutation to bust portfolio page cache.

Rule:
- No database access outside `server/`. Components and features never import Prisma directly.
- Every Server Action re-validates both `/` (portfolio) and the relevant admin route.
- Auth check is repeated inside every Server Action — never trust session from the client alone.

### 5. Data and State Layer
Responsibilities:
- Typed Prisma models as the single source of truth for data shape.
- Global client state limited to terminal session (command history, output lines, current directory) and window manager state (open windows, z-index, positions).
- No Redux or RTK Query — Server Actions + RSC cache replace API client layer entirely.

Rule:
- Keep request logic out of presentational components.
- Client state is ephemeral UI state only (terminal session, window positions). Persistent data lives in PostgreSQL.

## Feature Domains

### Identity and Access (Admin Only)
- Credentials-based sign-in via NextAuth — single admin user, no registration.
- Server-side session check in `(admin)/layout.tsx` — hard redirect, no client-side guards.
- Auth repeated inside every Server Action as a second check.
- Protected routes: `/dashboard/*`. Public routes: everything under `(portfolio)/`.

### Portfolio Content (Public — Terminal & Hyprland)
- Profile, Current Work, Projects, Skills, and Experience fetched via Prisma in RSC at render time.
- Data passed as props to the terminal — virtual filesystem built client-side from props.
- Two render modes share the same data: terminal mode (text output) and Hyprland mode (tiled panels).
- `open <slug>` command uses the `slug` field on Project as the stable identifier.

### Terminal Shell
- Command registry: typed command objects with name, aliases, description, handler.
- Virtual filesystem mirrors portfolio content as navigable directories and `.txt` files.
- State: current directory, command history (up/down arrow), output line buffer.
- Boot sequence plays on first load — character-by-character typewriter via `setTimeout` queue.

### Hyprland Window Manager
- GUI mode toggled via `gui` command from terminal; `terminal` command switches back.
- Window state: open windows, z-index stack, position, focus.
- Each portfolio section (About, Projects, Skills, Contact) opens as a draggable panel.
- Mobile: drag disabled, windows stack vertically.

### Admin Content Management (Backoffice)
- CRUD for Profile, Current Work, Projects, Skills (grouped by SkillCategory), and Experience entries.
- All mutations via Server Actions — no dedicated API routes.
- `revalidatePath("/")` called after every mutation to update the public portfolio instantly.
- Forms: controlled inputs, validation, confirmation on delete.

### Cross-Cutting Platform Concerns
- CRT scanline overlay: pure CSS `::after` pseudo-element on root layout — no JS.
- Monospace font and color theme (amber/green on black) applied via CSS variables in `(portfolio)/layout.tsx`.
- Admin panel uses a neutral, clean theme — visually separate from the terminal aesthetic.
- Error boundaries at route level for both portfolio and admin.

## Responsibility Flow Pattern

### Public Portfolio (Read)
```text
(portfolio)/page.tsx  [RSC]
  -> Prisma query (direct, server-side)
    -> buildFileSystem(data)  [features/terminal/fileSystem.ts]
      -> Terminal.tsx  [client component, receives data as props]
        -> CommandParser → OutputBlock / ProjectCard
```

### Admin Mutation (Write)
```text
Admin form submit
  -> Server Action  [server/actions/*.ts]
    -> auth() check
      -> db.model.update()  [Prisma]
        -> revalidatePath("/")  +  revalidatePath("/dashboard/...")
          -> Portfolio RSC re-renders with fresh data
```

## Database Schema (Prisma)

```prisma
model Profile {
  id          String   @id @default(cuid())
  name        String
  headline    String?
  location    String
  githubUrl   String
  linkedinUrl String
  bio         String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model CurrentWorkItem {
  id        String   @id @default(cuid())
  text      String
  order     Int      @default(0)
  visible   Boolean  @default(true)
}

model Project {
  id          String   @id @default(cuid())
  slug        String   @unique    // terminal command: `open genesis-1`
  title       String
  type        String              // "Web App", "Game", "Backend"
  status      String              // "In Progress", "Completed"
  stack       String[]
  description String
  features    String[]
  githubUrl   String?
  liveUrl     String?
  order       Int      @default(0)
  visible     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model SkillCategory {
  id      String  @id @default(cuid())
  name    String  @unique    // "Backend", "Security", "Game Dev"
  order   Int     @default(0)
  visible Boolean @default(true)
  skills  Skill[]
}

model Skill {
  id         String        @id @default(cuid())
  name       String
  category   SkillCategory @relation(fields: [categoryId], references: [id])
  categoryId String
  order      Int           @default(0)
  visible    Boolean       @default(true)
}

model Experience {
  id          String   @id @default(cuid())
  role        String
  type        String              // "Self-directed", "Freelance"
  stack       String[]
  description String
  bullets     String[]
  order       Int      @default(0)
  visible     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model AdminUser {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}
```

## File-Level Boundary Examples

### Portfolio Page (RSC — no client fetch)
```tsx
// app/(portfolio)/page.tsx
import { PortfolioShell } from "@/components/portfolio/PortfolioShell"
import { getPortfolioData } from "@/server/queries/portfolio"

export default async function Page() {
  const data = await getPortfolioData()
  return <PortfolioShell data={data} />
}
```

### Admin Layout (server-side auth guard)
```tsx
// app/(admin)/layout.tsx
import { auth } from "@/server/auth"
import { redirect } from "next/navigation"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")
  return <>{children}</>
}
```

### Server Action (mutation with revalidation)
```tsx
// server/actions/projects.ts
"use server"

import { db } from "@/server/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/server/auth"

export async function updateProject(id: string, data: ProjectUpdateInput) {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await db.project.update({ where: { id }, data })
  revalidatePath("/")
  revalidatePath("/dashboard/projects")
}
```

## Scaling Rules
- Promote patterns to shared docs only after at least two real usages.
- Prefer additive evolution over large rewrites.
- Keep architecture docs synced whenever introducing a new cross-cutting pattern.
- New content types (e.g. Blog, Certifications) follow the same pattern: Prisma model → Server Action → RSC fetch → terminal command + Hyprland window.
- The virtual filesystem is the public API of the portfolio — new DB models should map to a navigable path under `C:\RIFAT\`.

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Server Actions over API routes | Auth co-located with mutation, automatic cache revalidation, less boilerplate |
| RSC for portfolio page | Zero client JS for data fetching — terminal boots instantly with pre-loaded data |
| Prisma `slug` on Project | Maps directly to terminal command: `open genesis-1` |
| Single `AdminUser` model | Solo portfolio — no roles, no invite system, no complexity |
| `revalidatePath("/")` on every mutation | Portfolio always reflects latest DB state after admin saves |
| No Redux / RTK Query | Server Actions + RSC cache replace the API client layer entirely |
| Virtual FS built from DB props | Adding a project in admin automatically creates a navigable directory in terminal |