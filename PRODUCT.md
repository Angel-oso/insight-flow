# InsightFlow — Product Definition

<!-- impeccable:product-schema 1 -->

## Platform

web

**Tagline:** *InsightFlow turns feedback into better product decisions.*

**Alternative tagline:** *Listen clearly. Decide confidently.*

**Short description:** InsightFlow helps teams collect, organize, and prioritize feedback so they can make better product decisions.

## Product vision

InsightFlow is a multi-tenant web application for organizations that need a simple, shared place to turn feedback into action. It is intentionally industry-agnostic: a digital product team, e-commerce business, agency, school, healthcare service, or internal operations team can use the same workflow.

The product is not a public roadmap or a full customer-support system. Its core job is to make incoming feedback visible, structured, prioritized, and traceable.

## Problem

Feedback is usually scattered across support conversations, forms, email, calls, spreadsheets, and informal messages. Teams lose useful context, identify patterns too late, and make prioritization decisions without a reliable overview of demand or urgency.

This creates four practical failures:

- Valuable requests and issues are lost or duplicated.
- Important feedback is not distinguished from isolated opinions.
- Teams cannot see which projects are accumulating risk or backlog.
- Leaders cannot explain why feedback was prioritized, completed, or discarded.

## Value proposition

InsightFlow gives teams one workflow to:

1. Collect feedback through a shareable public link.
2. Organize it by project, category, status, and priority.
3. Assign ownership and move it through a clear lifecycle.
4. See feedback volume, urgency, patterns, and project health in a dashboard.

The first release should feel focused rather than heavy: structured intake, team triage, and decision-ready visibility.

## Target users

### Primary: product lead, founder, or product manager

This person owns product decisions at a small or medium organization. They need to understand feedback across multiple projects, see risks early, and decide what deserves investment.

### Secondary: manager or coordinator

This user manages the operational work of a team. They triage incoming feedback, assign owners, remove blockers, and monitor backlog.

### Secondary: team member

This user reviews feedback assigned to them, adds context, updates its status, and resolves or closes items.

### Feedback sender

Customers, employees, students, users, or clients submit feedback through a public form. They do not need an InsightFlow account.

## Representative use cases

- A SaaS team shares a feedback link after onboarding to find setup friction and missing features.
- An e-commerce company collects checkout, delivery, and catalog issues from customers.
- An agency organizes feedback from each client by active project.
- An HR or operations team receives internal suggestions and process concerns.
- An education platform captures requests from students and instructors by product area.

## Product principles

- **One source of truth:** feedback belongs to a project and can be found by the whole authorized team.
- **Action over collection:** every item has a status, priority, and—when needed—an owner.
- **Progressive disclosure:** leaders see organization health; coordinators see operational flow; members see their work.
- **Simple before smart:** manual categorization and prioritization come before AI, automation, or complex scoring.
- **Accessible by default:** feedback submission should work without an account and the interface must not rely on color alone.

## MVP scope

### Must have

- Account creation and sign-in.
- Create an organization and its first project.
- Invite or add team members with a role.
- Create projects within an organization.
- Generate an active public feedback link for each project.
- Public feedback form with title, description, category, and optional sender name and email.
- Feedback inbox with search and filters.
- Feedback detail view with category, priority, status, assignee, and internal comments.
- Manual classification and lifecycle updates.
- Role-aware dashboards.
- Organization-level metrics and project-health overview for administrators.

### Explicitly out of scope

- AI summaries, sentiment analysis, or automatic deduplication.
- Slack, Intercom, Jira, Zendesk, CRM, or email integrations.
- Public voting, public roadmap, or changelog.
- Billing, subscriptions, and plan enforcement.
- Advanced custom fields, custom workflows, or custom dashboard builders.
- CSV import/export and bulk operations.
- Complex notifications, automations, SSO, granular permissions, or audit reporting.

These are valid future directions, but none are required to demonstrate the core value in a professional portfolio project.

## Core workflow

1. A user creates an InsightFlow account.
2. They create an organization, for example, `Acme Studio`.
3. They create a project, for example, `Client Portal`.
4. InsightFlow provides a public feedback link for that project.
5. A customer, employee, or user submits feedback through the link.
6. The team sees the feedback in the project inbox.
7. A coordinator or member categorizes it, assigns a priority, changes its status, and optionally assigns an owner.
8. Team members add internal context and update its progress.
9. Leaders use dashboard metrics to identify trends, urgent feedback, and projects that require attention.

## Roles and permissions

| Role | Scope | Core permissions |
| --- | --- | --- |
| Administrator / owner | Organization | Full access to projects, members, feedback, dashboard, organization settings, and public links. |
| Manager / coordinator | Assigned organization or projects | View team work, triage feedback, assign owners, update status and priority, and review operational metrics. Cannot change organization ownership or global administration. |
| Member | Assigned projects and work | View allowed projects, work on assigned feedback, add comments, and update status within their permissions. |
| Feedback sender | Public form only | Submit feedback through an active project link. No authenticated app access. |

## Feedback lifecycle

### Categories

- Bug
- Feature request
- Improvement
- Question
- Other

### Priorities

- Low
- Medium
- High
- Critical

### Statuses

- New
- In review
- Planned
- In progress
- Completed
- Discarded

`Completed` and `Discarded` are final states. All other states count as open feedback.

## Information model

| Entity | Purpose | Essential fields |
| --- | --- | --- |
| User | Authenticated app user | id, name, email, avatarUrl, createdAt |
| Organization | Tenant and top-level workspace | id, name, slug, ownerId, createdAt |
| Membership | User role inside an organization | id, organizationId, userId, role, createdAt |
| Project | Product, service, client, or initiative receiving feedback | id, organizationId, name, description, slug, status, createdAt |
| Feedback link | Public intake endpoint for a project | id, projectId, slug, isActive, allowAnonymous, createdAt |
| Feedback | A submitted item that moves through the workflow | id, projectId, title, description, category, priority, status, assigneeId, senderName, senderEmail, createdAt, updatedAt |
| Comment | Internal discussion on feedback | id, feedbackId, authorId, body, createdAt |
| Activity | Readable event history for the dashboard | id, organizationId, projectId, feedbackId, actorId, type, metadata, createdAt |

`assigneeId` is required for the member-level dashboard. New feedback may begin unassigned and be assigned during triage.

## Dashboard model

The product uses a shared dashboard shell with different information density and permissions by role. It should not be implemented as three unrelated applications.

### Administrator dashboard

**Purpose:** understand organization-wide feedback health, identify risk, and decide where to intervene.

**Global controls:**

- Date range: 7, 30, 90 days, or custom.
- Project filter: all projects by default.
- Quick actions: create project and view feedback.

**Metric cards:**

| Metric | Definition | Decision supported |
| --- | --- | --- |
| Feedback received | Feedback created during the selected period | Is feedback volume increasing or decreasing? |
| Open feedback | Feedback not in `Completed` or `Discarded` | How large is the current backlog? |
| Critical items | Open feedback with `Critical` priority | What requires immediate attention? |
| Resolution rate | Completed feedback divided by total feedback | Is the organization closing feedback effectively? |

**Dashboard components:**

1. `PageHeader` with filters and actions.
2. `MetricCard` grid for the four key metrics.
3. `FeedbackTrendChart`: feedback received by day or week; show completed feedback later when status-history data is available.
4. `StatusDistributionCard`: donut chart for New, In review, Planned, In progress, Completed, and Discarded.
5. `AttentionRequiredList`: up to five critical, high-priority, unassigned, or stale open items.
6. `TopCategoriesChart`: horizontal bars for the five most frequent categories.
7. `ProjectHealthTable`: projects ranked by open feedback, showing received count, open count, critical count, resolution rate, latest activity, and health.
8. `RecentActivityFeed`: relevant assignments, priority changes, comments, completions, and project creation.

**Project health rules for the MVP:**

- `At risk`: one or more critical open items, or a clearly high open backlog.
- `Needs attention`: relevant open backlog without a critical condition.
- `Healthy`: no critical items and manageable open feedback.

This rule should remain transparent and simple; it is not a predictive score.

### Manager / coordinator dashboard

**Purpose:** organize the team's work and intervene in blocked or unowned feedback.

**Focus areas:**

- New, unassigned, critical, and stale feedback.
- Workload by team member.
- Feedback movement through statuses.
- Projects or queues building backlog.
- Fast actions to assign, reprioritize, and update feedback.

### Member dashboard

**Purpose:** show the next most important work for one contributor.

**Focus areas:**

- Feedback assigned to the member, ordered by priority and age.
- Critical or high-priority items needing action.
- Items with new comments or requested follow-up.
- Personal completed-work summary.

It must not expose organization settings, broad team-performance comparisons, or unrelated project data.

## Screen architecture

### Public

- Marketing landing page.
- Sign in and registration.
- Public feedback form at a project link.
- Submission confirmation.

### Authenticated application

- Onboarding: create organization and first project.
- Organization dashboard.
- Projects list and project dashboard.
- Feedback inbox.
- Feedback detail with comments and actions.
- Project settings: details, categories, and public link.
- Team management.
- Organization settings.

On desktop, use a persistent sidebar. On mobile, use a compact header and bottom navigation; data tables should become readable cards or focused list rows rather than a squeezed desktop table.

## Design direction

The visual language should be calm, data-literate, and credible for a modern B2B SaaS product.

- **Palette:** warm white and blue-gray neutrals; indigo/violet as the product accent; semantic green, amber, and red for status cues.
- **Typography:** Inter for UI clarity; Manrope can be used for display headings if a more distinctive brand tone is desired.
- **Layout:** 8px spacing system, restrained 8–12px radii, clear visual grouping, and ample whitespace.
- **Components:** buttons, inputs, selects, textarea, badges, priority chips, cards, tables, tabs, filters, dropdowns, modals, toasts, avatars, charts, empty states, loading skeletons, and error states.
- **Accessibility:** visible keyboard focus, semantic labels, contrast that meets WCAG AA, and state communication that is not color-only.

## Recommended technical plan

### Phase 1 — Product flow and interface design

- Design the primary flows in Figma.
- Define the information architecture, states, responsive behavior, and design system.
- Use realistic mock content across several projects and roles.

### Phase 2 — Functional frontend with simulated data

- Build with Next.js, React, and TypeScript.
- Implement the dashboard, feedback inbox, detail states, filters, form interactions, and role-switching demo data.
- Keep data typed and isolated behind a simple repository layer so mock data can later be replaced.

### Phase 3 — Backend, authentication, and persistence

- Add authentication, organizations, memberships, projects, feedback links, feedback, comments, and activity.
- Enforce organization and role access at the database boundary.
- Replace simulated metrics with database-backed aggregates.

## Recommended stack

- Next.js with App Router and TypeScript.
- Tailwind CSS and shadcn/ui for a cohesive, fast-to-build component foundation.
- React Hook Form and Zod for forms and validation.
- Supabase for authentication, PostgreSQL, Row Level Security, and server-side data access.
- Supabase-generated TypeScript types instead of adding an ORM at the beginning.
- Recharts for focused dashboard charts.
- Vercel for deployment.

The frontend should begin with typed mock data. Supabase can be introduced after the main workflow and interface are strong enough to demonstrate.

## Portfolio positioning

Position InsightFlow as an end-to-end product design and frontend case study, not merely a dashboard UI.

Include:

- The problem and audience definition.
- Information architecture and primary user flow.
- Dashboard role strategy and rationale.
- Wireframes, component system, and final responsive screens.
- Key UX decisions: public feedback without sign-in, simple manual triage, role-focused dashboards, and transparent health rules.
- A working demo: project creation, public submission, feedback triage, and dashboard updates.
- Technical decisions: multi-tenancy, role-aware access, typed data contracts, and responsive UI.
- Clearly framed future work: integrations, deduplication, voting, and automation.

For Upwork, describe the work as: **Designed and built a multi-tenant feedback management SaaS with public intake forms, role-based workflows, feedback prioritization, and responsive decision dashboards.**
