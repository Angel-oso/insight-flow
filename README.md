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
volume, urgency, and health in a dashboard. Deliberately **simple before
smart**: manual classification and prioritization; no AI, automations, or
scoring.

---

## The workflow, end to end

1. **Sign up** (email/password or Google), name your organization and its
   first project. You become the organization's owner and administrator.
2. **Share the public link** from *Project settings → Feedback intake*
   (`/f/<project>`). Anyone can submit feedback without an account.
3. **Triage in the inbox**: search and filter, set category and priority,
   assign an owner, move the status, and leave internal notes. Feedback that
   arrives by phone or email can be logged manually by triagers.
4. **Decide on the overviews**: each project shows its received vs. resolved
   trend, backlog, items needing intervention, and health; members see their
   own queue first, managers see workload by person. Administrators get an
   organization overview with every project's health. Ranges: 7, 30, 90 days,
   or custom dates.
5. **Grow the team**: invite people with a one-time, expiring link and a
   project role, change roles, or remove members (their open work returns to
   the unassigned queue).

---

## Routes

| Route | Audience | What it does |
| --- | --- | --- |
| `/` | Public | Landing page |
| `/login`, `/signup` | Public | Authentication |
| `/f/[projectSlug]` | Public | Feedback form and confirmation |
| `/invitations/[token]` | Signed in | Accept a project invitation |
| `/home`, `/feedback`, `/team` | Signed in | Open your first project's section |
| `/workspace` | Members | Projects list; organization overview for admins |
| `/workspace/settings` | Admins | Rename the organization, transfer ownership |
| `/projects/[slug]/home` | Members | Decision-ready project overview |
| `/projects/[slug]/feedback` | Members | Inbox: queue, detail, triage, notes |
| `/projects/[slug]/team` | Members | Workload, roles, invitations |
| `/projects/[slug]/settings` | Members | Identity, intake link, taxonomies, roles, archive |

Every page reads live data from the Convex backend; nothing is mocked. On
mobile the app uses a compact header and a bottom navigation bar.

### Organization workspace (`/workspace`)

Every member sees the projects they can open, with status and open and
critical counts. Administrators also get the organization metrics (received,
open, critical, resolution rate), a project health table ranked by open
feedback (cards on mobile), and recent activity across projects, including
project creation. Quick actions create a project or open the inbox.

### Project overview (`home`)

Intervention brief, metric band (received, open, critical, resolution),
feedback movement (received vs. resolved per day), backlog composition, a
"Needs intervention" queue with deep links, and recent activity. The view is
role-aware: **My work** lists the caller's assigned items by priority and
age, urgent items, items with new comments from others, and completed work in
the range; members see it first and never see team comparisons, while
managers and admins also get **Workload by team member**. The range (7, 30,
90 days, or a custom from/to of up to 365 days) lives in the URL.

### Inbox (`feedback`)

Search, filters by status/priority/category/date and "Assigned to me",
pagination, and expandable rows. The selected item lives in the URL
(`?feedback=<id>`), so it's shareable and works with back/forward. Every
triage change and note writes an activity entry.

### Public intake (`/f/[slug]`)

Title, description, category, and optional name and email. Validated on the
server; closed when the project is paused, archived, or its intake is turned
off. New items start in the first status with the project's default priority,
unassigned. A hidden honeypot field absorbs simple bots, and intake closes
when a project reaches its 200-item inbox limit so the team's views keep
working.

### Organization taxonomies

Statuses, categories, and priorities live in the `taxonomies` table, one set
per organization. Administrators rename options, pick colors, set ranks, mark
final statuses, and add or remove options (removal is blocked while the
organization's feedback still uses a value). Business rules derive from the
data: final statuses close the backlog, the top priority rank is the critical
lane, and the lowest status rank is where new feedback lands.

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Backend | Convex (database, queries, mutations, realtime) |
| Auth | Convex Auth (Google OAuth + email/password) |
| UI | Tailwind CSS 4, shadcn/ui, Base UI, Lucide |
| Charts | TanStack Charts |
| URL state | nuqs |
| Tests | Vitest + convex-test |

---

## Architecture

```text
app/
├── page.tsx                       → landing
├── (auth)/login, signup           → authentication
├── f/[projectSlug]/               → public feedback form
├── invitations/[token]/           → accept an invitation
├── workspace/                     → organization overview + settings
└── (app)/projects/[projectSlug]/  → home · feedback · team · settings

components/
├── landing/  intake/  invitations/
├── workspace/        → organization overview, projects, settings
├── home/dashboard/   → overview panels + presentation model
├── feedback/         → inbox, detail, filters, manual logging
├── team/             → roster, workload, invitations
├── project-settings/ → settings, public link, taxonomies, roles
└── projects/         → access gate + current-project context

convex/
├── schema.ts         → tables and indexes
├── access/roles.ts   → organization and project role resolution
├── feedback/         → access helpers, queries, mutations, shared creation
├── intake/public.ts  → anonymous form read + submission
├── dashboard/        → overview aggregates
├── organizations/    → organization overview, rename, ownership
├── projects/         → list, create, settings, roles, restore
├── team/             → roster, role changes, member removal
├── invitations/      → expiring one-time invitation links
├── taxonomies/       → per-organization display metadata
├── setup/            → workspace creation, access catalog
└── users/            → profile and account credentials
```

**Backend conventions:**

- Identity always comes from the auth session (`getAuthUserId`), never from
  arguments. Every read and write checks project membership and the role's
  capabilities on the server.
- Index-driven reads (`withIndex`), bounded collections (`take(n)`) with
  explicit errors instead of silent truncation.
- Time-windowed queries (overview, inbox ages) take `now` as an argument
  from the client instead of reading the clock.
- `args` + `returns` validators on every function.
- No stored counters: metrics, age, and relative times are derived.

---

## Data model

```text
organizations ─┬─ organizationMembers ── users
               ├─ projects ─┬─ projectMembers (user + role)
               │            ├─ projectInvitations
               │            └─ feedback ─┬─ comments
               │                         └─ activities
               └─ taxonomies (status · category · priority)

roles ── permissions   (built-in admin/manager/member + per-project custom roles)
```

**Transparent business rules** (same in backend and UI):

- **Open**: any status not marked final (by default `Completed`, `Discarded`).
- **Stale**: open with no activity for ≥ 7 days.
- **Needs attention**: open and top priority, unassigned, or stale.
- **Resolved**: any final status (by default `Completed` and `Discarded`);
  resolution rate = resolved / total.
- **Health** (one rule for project and organization views): `At risk` (≥ 1
  open item at the top priority, or ≥ 20 open items) · `Needs attention` (any
  open backlog) · `Healthy` (nothing open).
- **Archived projects** are read-only, including team, roles, and
  invitations, until an administrator restores them.

---

## Roles and permissions

| Role | Can |
| --- | --- |
| Owner | An admin who can also transfer organization ownership |
| Admin | Everything: triage, assign, log, manage project, team, roles, taxonomies, organization |
| Manager | Triage, assign, update, comment, and log feedback |
| Member | Comment and update the status of feedback assigned to them |
| Custom | Any combination, defined per project in settings |

Capabilities live in `lib/auth/permissions.ts` and are enforced in the backend
(`requireCapability`), never only in the UI.

---

## Getting started

Requirements: Node 20+ and `pnpm`.

```bash
pnpm install
cp .env.example .env.local
```

The app needs **two** processes:

```bash
# Terminal 1: backend (watch + codegen)
npx convex dev

# Terminal 2: frontend
pnpm dev
```

Configure auth once on the deployment (see `.env.example` for details):
`JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`, and optionally `AUTH_GOOGLE_ID` /
`AUTH_GOOGLE_SECRET` for Google sign-in.

Open `http://localhost:3000`, create an account, and name your organization
and first project.
Open *Project settings*, copy the public link, and submit some feedback to
see it arrive in the inbox and the overview.

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` | ESLint |
| `pnpm test` | Backend authorization and intake suites (Vitest + convex-test) |
| `npx tsc --noEmit` | Typecheck |
| `npx convex dev` | Backend watch + codegen |

---

## Deliberately out of scope

Integrations (Slack, Jira, email), AI summaries or deduplication, public
voting or roadmaps, billing, CSV import/export, bulk operations, and
notifications. Inbox filtering runs client-side over a 200-item cap per
project; moving it server-side is the natural next step as volume grows.

---

*Designed and built as an end-to-end product + engineering case study: public
intake, role-based workflows, feedback prioritization, and decision
dashboards.*
