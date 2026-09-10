import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { ensureTaxonomies } from "../taxonomies/lib";

const members = [
	{ name: "Sarah Johnson", email: "sarah@example.com", role: "admin" },
	{ name: "Michael Chen", email: "michael@example.com", role: "manager" },
	{ name: "Emma Rodriguez", email: "emma@example.com", role: "member" },
	{ name: "Daniel Smith", email: "daniel@example.com", role: "member" },
	{ name: "Priya Patel", email: "priya@example.com", role: "member" },
] as const satisfies readonly Pick<
	Doc<"memberships"> & Doc<"users">,
	"name" | "email" | "role"
>[];

const projects = [
	{
		name: "Client Portal",
		slug: "client-portal",
		description: "Customer workspace and organization access.",
		memberIndexes: [0, 1, 3],
		titles: [
			"Login failure on SSO",
			"Invite links expire immediately",
			"Bulk workspace invitations",
			"Improve the export progress indicator",
			"Where can I download invoices?",
			"Duplicate pricing page report",
		],
	},
	{
		name: "Mobile App",
		slug: "mobile-app",
		description: "Mobile customer experience and checkout flows.",
		memberIndexes: [0, 1, 4],
		titles: [
			"Checkout stalls after payment",
			"Receipt screen crashes",
			"Save favorite payment methods",
			"Improve offline error messages",
			"How do I update my address?",
			"Duplicate notification report",
		],
	},
	{
		name: "Academy",
		slug: "academy",
		description: "Learning experience and course progression.",
		memberIndexes: [0, 2],
		titles: [
			"Course video does not load",
			"Course progress not updating",
			"Add lesson bookmarks",
			"Improve course navigation",
			"Where can I find my certificate?",
			"Duplicate lesson typo report",
		],
	},
] as const;

const examples = [
	{
		status: "New",
		priority: "Critical",
		category: "Bug",
		description:
			"The main flow stops on a loading screen. Reported by a new customer and awaiting triage.",
	},
	{
		status: "In review",
		priority: "High",
		category: "Bug",
		description:
			"The team reproduced the issue and is checking the affected flow before planning a fix.",
	},
	{
		status: "Planned",
		priority: "Medium",
		category: "Feature request",
		description:
			"Customers requested this option to reduce repeated steps. Scheduled for the next iteration.",
	},
	{
		status: "In progress",
		priority: "High",
		category: "Improvement",
		description:
			"The current flow is difficult to understand. An assigned team member is improving the experience.",
	},
	{
		status: "Completed",
		priority: "Low",
		category: "Question",
		description:
			"The customer needed help finding this option. The team shared instructions and confirmed resolution.",
	},
	{
		status: "Discarded",
		priority: "Low",
		category: "Other",
		description:
			"This report duplicates an existing item. The team closed it after checking the original report.",
	},
] as const satisfies readonly Pick<
	Doc<"feedback">,
	"status" | "priority" | "category" | "description"
>[];

/** Small atomic demo seed. Repeating it preserves all existing demo edits. */
export const run = internalMutation({
	args: {},
	returns: v.object({
		created: v.boolean(),
		organizationId: v.id("organizations"),
	}),
	handler: async (ctx) => {
		// Display taxonomies always exist, even on databases seeded before them.
		await ensureTaxonomies(ctx);
		const existing = await ctx.db
			.query("organizations")
			.withIndex("by_slug", (q) => q.eq("slug", "acme-studio-demo"))
			.unique();
		if (existing) return { created: false, organizationId: existing._id };

		const now = Date.now();
		const day = 24 * 60 * 60 * 1000;
		const userIds = [];
		for (const { name, email } of members) {
			const user = await ctx.db
				.query("users")
				.withIndex("email", (q) => q.eq("email", email))
				.unique();
			userIds.push(
				user?._id ?? (await ctx.db.insert("users", { name, email })),
			);
		}
		const organizationId = await ctx.db.insert("organizations", {
			name: "Acme Studio (Demo)",
			slug: "acme-studio-demo",
			ownerId: userIds[0],
		});
		const membershipIds = [];
		for (const [index, member] of members.entries()) {
			membershipIds.push(
				await ctx.db.insert("memberships", {
					organizationId,
					userId: userIds[index],
					role: member.role,
					joinedAt: now - (90 - index * 7) * day,
				}),
			);
		}

		for (const project of projects) {
			// Public inbox slugs are global. Never overwrite a different workspace.
			const collision = await ctx.db
				.query("projects")
				.withIndex("by_slug", (q) => q.eq("slug", project.slug))
				.unique();
			if (collision)
				throw new Error(`Project slug already exists: ${project.slug}`);
			const projectId = await ctx.db.insert("projects", {
				organizationId,
				name: project.name,
				slug: project.slug,
				description: project.description,
				status: "Active",
				inboxEnabled: true,
				defaultPriority: "Medium",
				criticalAlerts: true,
				weeklyDigest: true,
				updatedAt: now,
			});
			for (const memberIndex of project.memberIndexes) {
				await ctx.db.insert("projectMembers", {
					projectId,
					membershipId: membershipIds[memberIndex],
				});
			}
			for (const [index, example] of examples.entries()) {
				const receivedAt = now - (index * 5 + 2) * day;
				const updatedAt = index === 0 ? receivedAt : receivedAt + day;
				const assigneeId =
					index === 0
						? null
						: userIds[
								project.memberIndexes[index % project.memberIndexes.length]
							];
				const feedbackId = await ctx.db.insert("feedback", {
					projectId,
					title: project.titles[index],
					...example,
					assigneeId,
					sender:
						index === 5
							? null
							: {
									name: `Demo Customer ${index + 1}`,
									email: `customer${index + 1}@example.com`,
								},
					receivedAt,
					updatedAt,
					...(example.status === "Completed" ? { completedAt: updatedAt } : {}),
				});
				await ctx.db.insert("activities", {
					projectId,
					feedbackId,
					actorId: null,
					type: "received",
					message: `Feedback received through the ${project.name} public inbox`,
					createdAt: receivedAt,
				});
				if (example.status !== "New") {
					await ctx.db.insert("activities", {
						projectId,
						feedbackId,
						actorId: assigneeId,
						type: "status_changed",
						message: `Status moved to ${example.status}`,
						createdAt: updatedAt,
					});
				}
				if (index === 1 && assigneeId !== null) {
					await ctx.db.insert("comments", {
						feedbackId,
						authorId: assigneeId,
						body: "Reproduced in the demo workspace. Reviewing the affected flow before choosing a fix.",
						createdAt: updatedAt,
					});
					await ctx.db.insert("activities", {
						projectId,
						feedbackId,
						actorId: assigneeId,
						type: "commented",
						message: "Added an internal note with reproduction details",
						createdAt: updatedAt,
					});
				}
			}
		}
		return { created: true, organizationId };
	},
});
