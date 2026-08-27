---
version: 1
slug: "app-app-feedback-page-tsx"
primary_target: "app/(app)/feedback/page.tsx"
related_targets: ["components/feedback/index.tsx","components/feedback/feedback-workspace.tsx"]
---

# Feedback admin

- **Scope and mode:** Authenticated `/feedback` route, Operate mode.
- **Audience and job:** Administrators need to turn organization-wide incoming feedback into an accountable, traceable decision.
- **Task and proof:** Search and filter the queue, inspect context, classify category and priority, set lifecycle status, assign an owner, and add internal notes with activity history.
- **Constraints:** Keep the Decision Brief visual system, semantic theme tokens, responsive list-to-card transformation, typed simulated data, and a small client boundary. The UI is Admin-only now, while shared role capabilities prepare later scopes.
- **Direction:** A split decision desk: a filterable evidence queue remains visible beside the current item's decision record. The memorable moment is resolving urgency without losing the surrounding backlog.
- **Unresolved:** Persistence, authentication, and organization/project scope enforcement will replace the simulated repository and client-only mutations.
