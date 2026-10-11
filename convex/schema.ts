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
	organizations: defineTable({
		name: v.string(),
		slug: v.string(),
		ownerId: v.id("users"),
	}).index("by_slug", ["slug"]),
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
	})
		.index("by_slug", ["slug"])
		.index("by_organizationId", ["organizationId"]),
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
	})
		.index("by_token", ["token"])
		.index("by_projectId", ["projectId"]),
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
		.index("by_projectId_assigneeId", ["projectId", "assigneeId"]),
	comments: defineTable({
		feedbackId: v.id("feedback"),
		authorId: v.id("users"),
		body: v.string(),
		createdAt: v.number(),
	}).index("by_feedbackId_createdAt", ["feedbackId", "createdAt"]),
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
		.index("by_feedbackId_createdAt", ["feedbackId", "createdAt"]),
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
});
