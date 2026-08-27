---
version: 1
slug: "app-app-projects-projectslug-settings-page-tsx"
primary_target: "app/(app)/projects/[projectSlug]/settings/page.tsx"
related_targets: ["components/project-settings/index.tsx","components/project-settings/project-settings-workspace.tsx"]
---

# Project settings surface brief

- **Scope & mode:** Project administration settings; operate mode.
- **Audience and job:** An administrator needs to configure the active project without losing its operational context.
- **Primary actions:** Update identity and lifecycle status, manage feedback intake defaults, choose notification policy, and archive safely.
- **Proof of success:** The project key and member scope are visible; controls explain their operational consequence; archival requires an explicit confirmation.
- **Constraints:** Reuse the established dark InsightFlow system and semantic theme tokens. Keep the route server-led with a single client workspace. The Admin capability boundary must leave room for Manager and Member roles. Browser storage is only a transparent MVP persistence layer.
- **Direction:** Lead with identity and access context, then use full-width operational policy rows for intake and notifications. Keep archival isolated as an intentional, guarded action rather than a competing primary control.
- **Responsive behavior:** Stack the top columns and align policy actions beneath their descriptions on narrow screens. Preserve a readable action hierarchy without a secondary header.
- **Open follow-up:** Replace local browser persistence with workspace-backed data and Server Actions when authentication and the project data source are connected.
