import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const role = v.union(
	v.literal("admin"),
	v.literal("manager"),
	v.literal("member"),
);
// Feedback category/priority/status are free strings validated against the
// taxonomies table at write time, so workspaces can define their own values.
// The unions below document the seeded defaults only.

export default defineSchema({
	// Convex Auth tables (users, sessions, accounts, verifiers, rate
	// limits). `users` keeps every field optional: OAuth and password
	// flows create the row before the profile is complete, so readers must
	// fall back on missing name/email instead of assuming them.
	...authTables,
	organizations: defineTable({
		name: v.string(),
		slug: v.string(),
		ownerId: v.id("users"),
	}).index("by_slug", ["slug"]),
	memberships: defineTable({
		organizationId: v.id("organizations"),
		userId: v.id("users"),
		role,
		joinedAt: v.number(),
	})
		.index("by_organizationId_userId", ["organizationId", "userId"])
		.index("by_userId", ["userId"]),
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
		membershipId: v.id("memberships"),
	})
		.index("by_projectId_membershipId", ["projectId", "membershipId"])
		.index("by_membershipId", ["membershipId"]),
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
		.index("by_projectId_assigneeId", ["projectId", "assigneeId"])
		// Global value lookups for taxonomy management (usage checks).
		.index("by_status", ["status"])
		.index("by_category", ["category"])
		.index("by_priority", ["priority"]),
	comments: defineTable({
		feedbackId: v.id("feedback"),
		authorId: v.id("users"),
		body: v.string(),
		createdAt: v.number(),
	}).index("by_feedbackId_createdAt", ["feedbackId", "createdAt"]),
	activities: defineTable({
		projectId: v.id("projects"),
		feedbackId: v.id("feedback"),
		actorId: v.union(v.id("users"), v.null()),
		type: v.union(
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
	// token). Stored as JSON docs — one per taxonomy — so every surface reads
	// the same labels and colors. Validation stays on the schema unions.
	taxonomies: defineTable({
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
	}).index("by_key", ["key"]),
});
