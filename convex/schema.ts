import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const capability = v.union(
	v.literal("feedback.view"),
	v.literal("feedback.triage"),
	v.literal("feedback.assign"),
	v.literal("feedback.update"),
	v.literal("feedback.comment"),
	v.literal("project.view"),
	v.literal("project.manage"),
	v.literal("team.view"),
	v.literal("team.manage"),
	v.literal("organization.manage"),
);
// Feedback category/priority/status are free strings validated against the
// taxonomies table at write time, so workspaces can define their own values.
// The unions below document the seeded defaults only.

export default defineSchema({
	// Convex Auth tables (users, sessions, accounts, verifiers, rate
	// limits). `organizationId` and `roleIds` are legacy fields kept only so old
	// documents validate; they grant nothing. organizationMembers is the source
	// of truth (backfill with setup/admin:migrateLegacyMemberships).
	...authTables,
	users: defineTable({
		...authTables.users.validator.fields,
		organizationId: v.optional(v.id("organizations")),
		roleIds: v.optional(v.array(v.id("roles"))),
	})
		.index("email", ["email"])
		.index("phone", ["phone"]),
	// One pending email change per user. The new address only replaces the
	// sign-in email after its owner enters the code we sent to it.
	emailChangeRequests: defineTable({
		userId: v.id("users"),
		email: v.string(),
		codeHash: v.string(),
		expiresAt: v.number(),
		attempts: v.number(),
	}).index("by_userId", ["userId"]),
	organizations: defineTable({
		name: v.string(),
		slug: v.string(),
		ownerId: v.id("users"),
		// Set when the owner deletes the organization. From then on it is
		// invisible to every query while convex/organizations/deletion.ts
		// removes its projects and memberships in batches.
		deletionRequestedAt: v.optional(v.number()),
		// Pending purge job (7 days after the request, or at once when the
		// owner deletes their account). Cancelled by a restore.
		purgeJobId: v.optional(v.id("_scheduled_functions")),
	})
		.index("by_slug", ["slug"])
		.index("by_ownerId", ["ownerId"])
		// Ops monitoring (convex/monitoring): deletions whose purge never finished.
		.index("by_deletionRequestedAt", ["deletionRequestedAt"]),
	organizationMembers: defineTable({
		organizationId: v.id("organizations"),
		userId: v.id("users"),
		roleIds: v.array(v.id("roles")),
	})
		.index("by_userId", ["userId"])
		.index("by_organizationId_userId", ["organizationId", "userId"]),
	permissions: defineTable({ key: capability }).index("by_key", ["key"]),
	roles: defineTable({
		name: v.string(),
		permissionIds: v.array(v.id("permissions")),
		// Missing for the three protected base roles; custom roles belong to one project.
		projectId: v.optional(v.id("projects")),
	})
		.index("by_name", ["name"])
		.index("by_projectId", ["projectId"])
		.index("by_projectId_name", ["projectId", "name"]),
	projects: defineTable({
		organizationId: v.id("organizations"),
		name: v.string(),
		slug: v.string(),
		description: v.string(),
		status: v.union(
			v.literal("Active"),
			v.literal("Paused"),
			v.literal("Archived"),
		),
		// One public inbox per project; its path uses the project's slug.
		inboxEnabled: v.boolean(),
		defaultPriority: v.string(),
		criticalAlerts: v.boolean(),
		weeklyDigest: v.boolean(),
		updatedAt: v.optional(v.number()),
		// Set when an administrator deletes the project (status becomes
		// Archived too). The project is hidden from every lookup at once while
		// convex/projects/deletion.ts purges its data in batches and finally
		// removes this document.
		deletionRequestedAt: v.optional(v.number()),
		// What deletion switched off, so a restore within the 7-day window
		// puts it back. `withOrganization`: hidden only because the whole
		// organization was deleted (restored together with it).
		deletion: v.optional(v.object({
			status: v.union(v.literal("Active"), v.literal("Paused"), v.literal("Archived")),
			inboxEnabled: v.boolean(),
			criticalAlerts: v.boolean(),
			weeklyDigest: v.boolean(),
			withOrganization: v.optional(v.boolean()),
			purgeJobId: v.optional(v.id("_scheduled_functions")),
		})),
	})
		.index("by_slug", ["slug"])
		.index("by_organizationId", ["organizationId"])
		// Live projects of an organization (deletionRequestedAt missing), so
		// limits and overviews never count projects being deleted.
		.index("by_organizationId_deletionRequestedAt", ["organizationId", "deletionRequestedAt"])
		// Ops monitoring (convex/monitoring): deletions whose purge never finished.
		.index("by_deletionRequestedAt", ["deletionRequestedAt"]),
	// Slugs of purged projects and organizations. Never handed out again, so
	// old public form links, bookmarks and invitations can never resolve to
	// someone else's new workspace.
	retiredSlugs: defineTable({
		slug: v.string(),
		kind: v.union(v.literal("project"), v.literal("organization")),
		retiredAt: v.number(),
	}).index("by_slug_kind", ["slug", "kind"]),
	projectMembers: defineTable({
		projectId: v.id("projects"),
		userId: v.id("users"),
		// Optional for existing memberships. New invitations pin the role to this
		// project so an administrator here is not an administrator everywhere.
		roleId: v.optional(v.id("roles")),
		joinedAt: v.number(),
	})
		.index("by_projectId_userId", ["projectId", "userId"])
		.index("by_userId", ["userId"]),
	projectInvitations: defineTable({
		projectId: v.id("projects"),
		roleId: v.id("roles"),
		token: v.string(),
		createdBy: v.id("users"),
		expiresAt: v.number(),
		acceptedAt: v.optional(v.number()),
		// Normalized recipient for invitations sent by email. The link stays
		// the single-use secret; it is delivered only to that inbox.
		email: v.optional(v.string()),
	})
		.index("by_token", ["token"])
		.index("by_projectId", ["projectId"])
		// Pending links of a project (acceptedAt missing), soonest expiry first.
		.index("by_projectId_acceptedAt_expiresAt", ["projectId", "acceptedAt", "expiresAt"])
		// Daily cleanup of long-expired links (accepted links expire too).
		.index("by_expiresAt", ["expiresAt"])
		// Account deletion removes the links a person created.
		.index("by_createdBy", ["createdBy"]),
	feedback: defineTable({
		projectId: v.id("projects"),
		title: v.string(),
		description: v.string(),
		category: v.string(),
		priority: v.string(),
		status: v.string(),
		assigneeId: v.union(v.id("users"), v.null()),
		sender: v.union(
			v.object({ name: v.string(), email: v.string() }),
			v.null(),
		),
		receivedAt: v.number(),
		updatedAt: v.number(),
		completedAt: v.optional(v.number()),
	})
		.index("by_projectId_receivedAt", ["projectId", "receivedAt"])
		.index("by_projectId_completedAt", ["projectId", "completedAt"])
		.index("by_projectId_status", ["projectId", "status"])
		.index("by_projectId_category", ["projectId", "category"])
		.index("by_projectId_priority", ["projectId", "priority"])
		.index("by_projectId_assigneeId", ["projectId", "assigneeId"])
		// Inbox pagination: one equality filter plus newest-first order (and
		// the optional received date range) stay inside a single index range.
		.index("by_projectId_status_receivedAt", ["projectId", "status", "receivedAt"])
		.index("by_projectId_priority_receivedAt", ["projectId", "priority", "receivedAt"])
		.index("by_projectId_category_receivedAt", ["projectId", "category", "receivedAt"])
		.index("by_projectId_assigneeId_receivedAt", ["projectId", "assigneeId", "receivedAt"])
		// Bounded overview reads: latest activity, stale/attention buckets and
		// a member's personal queue, without scanning the whole project.
		.index("by_projectId_updatedAt", ["projectId", "updatedAt"])
		.index("by_projectId_assigneeId_updatedAt", ["projectId", "assigneeId", "updatedAt"])
		.index("by_projectId_status_priority_updatedAt", ["projectId", "status", "priority", "updatedAt"])
		.index("by_projectId_assigneeId_status_priority_receivedAt", [
			"projectId",
			"assigneeId",
			"status",
			"priority",
			"receivedAt",
		])
		// Personal data export: everything assigned to a person.
		.index("by_assigneeId_receivedAt", ["assigneeId", "receivedAt"])
		.searchIndex("search_title", {
			searchField: "title",
			filterFields: ["projectId", "status", "priority", "category", "assigneeId"],
		}),
	comments: defineTable({
		feedbackId: v.id("feedback"),
		authorId: v.id("users"),
		body: v.string(),
		createdAt: v.number(),
	})
		.index("by_feedbackId_createdAt", ["feedbackId", "createdAt"])
		// Personal data export (convex/users/export.ts).
		.index("by_authorId_createdAt", ["authorId", "createdAt"]),
	activities: defineTable({
		projectId: v.id("projects"),
		feedbackId: v.optional(v.id("feedback")),
		actorId: v.union(v.id("users"), v.null()),
		type: v.union(
			v.literal("project_created"),
			v.literal("received"),
			v.literal("status_changed"),
			v.literal("commented"),
			v.literal("updated"),
		),
		message: v.string(),
		createdAt: v.number(),
	})
		.index("by_projectId_createdAt", ["projectId", "createdAt"])
		.index("by_feedbackId_createdAt", ["feedbackId", "createdAt"])
		// Personal data export: a person's own activity, and what they logged.
		.index("by_actorId_type_createdAt", ["actorId", "type", "createdAt"]),
	// Display metadata for the feedback enums (text, rank/level, tone, chart
	// token). One doc per organization and key; legacy unscoped docs are ignored.
	taxonomies: defineTable({
		organizationId: v.optional(v.id("organizations")),
		key: v.union(
			v.literal("status"),
			v.literal("category"),
			v.literal("priority"),
		),
		label: v.string(),
		items: v.array(
			v.object({
				value: v.string(),
				label: v.string(),
				rank: v.number(),
				tone: v.union(
					v.literal("primary"),
					v.literal("info"),
					v.literal("success"),
					v.literal("warning"),
					v.literal("danger"),
					v.literal("muted"),
				),
				// Hex color picked in settings (#rrggbb). Badges and charts
				// derive from it; tone stays as fallback for older docs.
				color: v.optional(v.string()),
				// Statuses only: final states don't count as open backlog.
				isFinal: v.optional(v.boolean()),
				chartToken: v.optional(v.string()),
				description: v.optional(v.string()),
			}),
		),
	}).index("by_organizationId_key", ["organizationId", "key"]),
	// Organization-level audit trail (role changes, ownership, removals,
	// deletions/restores, invitations). Written only via convex/audit/log.ts.
	auditLogs: defineTable({
		organizationId: v.id("organizations"),
		projectId: v.optional(v.id("projects")),
		actorId: v.optional(v.id("users")),
		action: v.string(),
		targetUserId: v.optional(v.id("users")),
		summary: v.string(),
		at: v.number(),
	}).index("by_organizationId_at", ["organizationId", "at"]),
	// Per-member email preferences for one project (absent row = all on).
	// `unsubscribeToken` is a random secret embedded in every notification
	// email so the one-click unsubscribe link works without signing in.
	notificationPreferences: defineTable({
		userId: v.id("users"),
		projectId: v.id("projects"),
		criticalAlerts: v.boolean(),
		weeklyDigest: v.boolean(),
		unsubscribeToken: v.string(),
		updatedAt: v.number(),
	})
		.index("by_userId_projectId", ["userId", "projectId"])
		.index("by_projectId", ["projectId"])
		.index("by_unsubscribeToken", ["unsubscribeToken"]),
	// Critical alert ledger: dedupes alerts per item and folds bursts into a
	// summary. "folded" rows wait for the project's summary email; rows are
	// purged daily once they no longer affect dedupe.
	criticalAlertLog: defineTable({
		projectId: v.id("projects"),
		feedbackId: v.id("feedback"),
		state: v.union(v.literal("sent"), v.literal("folded"), v.literal("summarized")),
		at: v.number(),
	})
		.index("by_feedbackId_at", ["feedbackId", "at"])
		.index("by_projectId_state_at", ["projectId", "state", "at"])
		.index("by_at", ["at"]),
	// Addresses that hard-bounced or complained (Brevo webhook). Notification
	// emails skip them; auth codes still go out.
	emailSuppressions: defineTable({
		email: v.string(),
		reason: v.union(v.literal("bounced"), v.literal("complained")),
		detail: v.optional(v.string()),
		at: v.number(),
	}).index("by_email", ["email"]),
	// Ops monitoring (convex/monitoring/alerts.ts). One row per watermark key:
	// completion time of the newest failed scheduled job already reported.
	monitoringState: defineTable({
		key: v.string(),
		watermark: v.number(),
	}).index("by_key", ["key"]),
	// Alert throttle per function name (or stuck-deletion key). Failures seen
	// while throttled are counted in `suppressed` and reported in the next email.
	monitoringThrottle: defineTable({
		key: v.string(),
		lastAlertAt: v.number(),
		suppressed: v.number(),
	})
		.index("by_key", ["key"])
		.index("by_suppressed", ["suppressed"])
		.index("by_lastAlertAt", ["lastAlertAt"]),
	// [area:notifications] tables
	// [area:auth] tables
	// Short-lived grants for one feedback export: created (rate-limited and
	// audit-logged) by convex/feedback/export.ts `start`, required by every
	// `page` read, deleted by a scheduled job after EXPORT_TTL.
	feedbackExports: defineTable({
		projectId: v.id("projects"),
		userId: v.id("users"),
		format: v.union(v.literal("csv"), v.literal("json")),
		createdAt: v.number(),
	}),
	// [area:feedback-data] tables
	// [area:lifecycle] tables
	// Files attached to a feedback item by the team (never by public intake).
	// The blob lives in Convex storage; this row is its only reference, so
	// convex/attachments/cleanup.ts treats unreferenced files as orphans.
	// `verified` flips once the file's leading bytes match `contentType`.
	feedbackAttachments: defineTable({
		projectId: v.id("projects"),
		feedbackId: v.id("feedback"),
		storageId: v.id("_storage"),
		fileName: v.string(),
		contentType: v.string(),
		size: v.number(),
		uploadedBy: v.id("users"),
		createdAt: v.number(),
		verified: v.boolean(),
	})
		.index("by_feedbackId", ["feedbackId"])
		.index("by_storageId", ["storageId"]),
	// Singleton: the key that signs short-lived attachment download links and
	// the orphan sweep's watermark (files created up to here were checked).
	attachmentState: defineTable({
		signingKey: v.string(),
		sweptUntil: v.number(),
	}),
	// Outgoing webhooks of a project (at most 3). `secret` signs every
	// delivery and is returned to the client only once, on creation.
	webhooks: defineTable({
		projectId: v.id("projects"),
		name: v.string(),
		url: v.string(),
		format: v.union(v.literal("slack"), v.literal("json")),
		events: v.array(v.union(v.literal("feedback.created"), v.literal("feedback.critical"))),
		secret: v.string(),
		enabled: v.boolean(),
		// Deliveries that failed after every retry, in a row. Reset by a
		// success; at 10 the webhook disables itself.
		consecutiveFailures: v.number(),
		disabledReason: v.optional(v.string()),
		lastDelivery: v.optional(
			v.object({
				at: v.number(),
				ok: v.boolean(),
				status: v.optional(v.number()),
				error: v.optional(v.string()),
				test: v.boolean(),
			}),
		),
		createdBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_projectId", ["projectId"]),
	// Single-use attachment upload tickets (convex/attachments/files.ts).
	// Only the SHA-256 of the ticket is stored; expired rows are deleted by
	// the hourly orphan sweep.
	attachmentUploadTickets: defineTable({
		tokenHash: v.string(),
		userId: v.id("users"),
		projectId: v.id("projects"),
		feedbackId: v.id("feedback"),
		expiresAt: v.number(),
	})
		.index("by_tokenHash", ["tokenHash"])
		.index("by_expiresAt", ["expiresAt"]),
	// Dedupe ledger for `feedback.critical` webhooks: at most one dispatch per
	// item per CRITICAL_WEBHOOK_DEDUPE_MS. Purged daily once past the window.
	webhookCriticalLog: defineTable({
		projectId: v.id("projects"),
		feedbackId: v.id("feedback"),
		at: v.number(),
	})
		.index("by_feedbackId_at", ["feedbackId", "at"])
		.index("by_at", ["at"]),
	// [area:attachments-integrations] tables
});
