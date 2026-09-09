# InsightFlow

**Turn scattered feedback into clear, traceable product decisions.**

InsightFlow is a multi-tenant web app where teams collect feedback through a
public link, organize it by project, category, status, and priority, assign
owners, and see each project's health in a dashboard built for deciding where
to intervene.

---

## Why it exists

Feedback usually lives scattered across support conversations, forms, email,
calls, spreadsheets, and informal messages. That produces four practical
failures:

- Valuable requests get lost or duplicated.
- Important feedback can't be told apart from isolated opinions.
- Nobody sees which projects are accumulating risk or backlog.
- Nobody can explain why something was prioritized, completed, or discarded.

InsightFlow provides **one workflow**: collect via a public link, organize by
project, assign owners, move each item through a clear lifecycle, and see
volume, urgency, and health in a dashboard. Deliberately **simple before smart**:
manual classification and prioritization first; no AI, automations, or scoring
in the MVP.

---

## What's included

| Page | Route | Data status |
| --- | --- | --- |
| Project overview | `/projects/[slug]/home` | Real Convex backend |
| Feedback queue | `/projects/[slug]/feedback` | Real Convex backend |
| Team | `/projects/[slug]/team` | Local demo data |
| Project settings | `/projects/[slug]/settings` | Local (localStorage) |

### Overview (`home`)

A decision-ready view: intervention brief, metric band (received, open,
critical, resolution), project health, feedback movement (received vs. resolved
per day), backlog composition, a "Needs intervention" queue with deep-links to
each item, and recent activity. Everything is computed in the backend with a
single transactional query (`api.overview.get`).

### Feedback (`feedback`)

A filterable queue with search, filters by status/priority/category/date,
pagination, and expandable rows: opening an item loads its comments and history,
and the selection lives in the URL (`?feedback=<id>`), so it's shareable and
works with back/forward. Real mutations for triage, assignment, status changes,
and comments, each producing its activity entry.

### Database-driven taxonomies

Statuses, categories, and priorities are not hardcoded: they live in the
`taxonomies` table as JSON docs (`value`, `label`, `rank`, `color`, `isFinal`,
`tone`, `description`). Every surface (filters, badges, donut, settings)
reads text, level, and color from the database. The project settings page lets
admins rename options, pick colors with the native color input, set ranks, mark
final states, and create or remove options (removal is blocked while feedback
still uses a value). Changes apply everywhere instantly with no deploy.

Two architectural rules keep dynamic values safe:

- The schema stores plain strings; every write validates values against the
  taxonomy docs, and `value` slugs never change once created.
- Business rules derive from data, not literals: final statuses close the
  backlog, the top priority rank defines the critical lane, and the lowest
  status rank is the triage lane.

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Backend | Convex (database, queries, mutations, realtime) |
| UI | Tailwind CSS 4, shadcn/ui, Base UI, Lucide |
| Charts | Tanstack Charts |
| URL state | nuqs |
| Fonts | Inter (UI) + Manrope (display) |

---

## Architecture

```text
app/(app)/projects/[projectSlug]/
├── home/page.tsx        →  Dashboard (overview)
├── feedback/page.tsx    →  Feedback (queue + detail)
├── team/page.tsx        →  Team (local demo)
└── settings/page.tsx    →  Settings (local demo)

components/
├── home/dashboard/      →  panels + model.ts (presentation) + use-overview.ts
├── feedback/            →  workspace, accordion list, detail, filters, model.ts
├── project-settings/    →  settings (reads taxonomies via useTaxonomies)
└── ui/                  →  shadcn/ui

convex/
├── schema.ts            →  9 tables + indexes
├── feedback.ts          →  workspace, detail, update, addComment
├── overview.ts          →  get (dashboard aggregates)
├── taxonomies.ts        →  list, ensureDefaults + helpers
├── feedback/access.ts   →  requireProject/requireFeedback + bounded listings
└── seed.ts              →  idempotent demo data (Acme Studio)

lib/
├── projects.ts          →  demo project catalog
├── taxonomy.ts          →  types, tone→class map, useTaxonomies hook
└── auth/permissions.ts  →  roles (admin/manager/member) and capabilities
```

**Conventions enforced across the backend:**

- Index-driven reads (`withIndex`), never `filter()` as a WHERE clause.
- Bounded collections (`take(n)`); the workspace caps at 200 items per project.
- No wall-clock in queries: `now` comes in as an argument, refreshed by the
  client every 60 seconds.
- `args` + `returns` validators on every function (object form).
- No stored counters: metrics, age, and relative times are derived.

---

## Data model

```text
organizations ─┬─ memberships (user + role) ─┬─ projectMembers ── projects
               │                              │
               └─ users                       └─ feedback ─┬─ comments
                                                          └─ activities

taxonomies (global): status · category · priority  →  JSON display metadata
```

**Transparent business rules** (same in backend and UI):

- **Open**: anything not `Completed` or `Discarded`.
- **Stale**: open with no activity for ≥ 7 days.
- **Needs attention**: open + (Critical, High, unassigned, or stale).
- **Health**: `At risk` (≥ 1 open critical) · `Needs attention` (backlog with
  no criticals) · `Healthy` (zero open).

---

## Getting started

Requirements: Node 20+ and `pnpm`.

```bash
pnpm install
```

The app needs **two** processes: Next.js and Convex (the latter pushes schema
and functions to the `.env.local` deployment).

```bash
# Terminal 1 — backend (watch + codegen on every change)
npx convex dev

# Terminal 2 — frontend
pnpm dev
```

Open `http://localhost:3000/projects/academy/home`.

### Seeding the demo

The seed is idempotent (re-running it preserves your edits). Since `seed:run`
is internal, run it from the Convex dashboard (**Functions → seed:run**) or via
the CLI if you expose it. It creates:

- Org `Acme Studio (Demo)` + 5 users with roles + 3 projects.
- 18 feedback items covering all 6 statuses, 5 categories, and unassigned cases.
- The 3 taxonomies (`status`, `category`, `priority`).
- Sample comments and activities.

Required variables live in `.env.local`:

```bash
CONVEX_DEPLOYMENT=...
NEXT_PUBLIC_CONVEX_URL=...
NEXT_PUBLIC_CONVEX_SITE_URL=...
```

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` | ESLint |
| `npx tsc --noEmit` | Typecheck (catches most issues before deploy) |
| `npx convex dev` | Backend watch + codegen |
| `npx convex run taxonomies:ensureDefaults` | Re-seed taxonomies (requires exposing it) |

---

## Roles and permissions

| Role | Can |
| --- | --- |
| Admin | Everything: triage, assign, update, comment, manage |
| Manager | Triage, assign, update, and comment (no global admin) |
| Member | Comment and update only their assigned feedback |

Capabilities live in `lib/auth/permissions.ts` and are enforced in the backend
(`requireCapability`), never in the UI alone.

---

## Deliberately simple decisions (and what's next)

**Not included today**: real auth (shared demo identity), public intake (form
by project slug), server-side pagination, notifications, or import/export.
Feedback filtering and pagination run client-side over a 200-item cap; moving
them server-side is the natural next step as volume grows.

**Future**: public intake with a `submit` mutation, authentication, creating
orgs/projects/users from the UI, an admin page for editing taxonomies (the
architecture already allows it: only mutation + UI are missing), and aggregates
via `@convex-dev/aggregate` if counts get expensive.

---

*Designed and built as an end-to-end product + frontend case study: public
intake, role-based workflows, feedback prioritization, and responsive
decision dashboards.*
