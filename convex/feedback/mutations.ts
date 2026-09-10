import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCapability, requireFeedback } from "./access";
import { getFinalStatuses, getTaxonomies } from "../taxonomies/lib";
import schema from "../schema";

const updateFields = schema.tables.feedback.validator
	.pick("category", "priority", "status", "assigneeId")
	.partial();

export const update = mutation({
	args: {
		projectSlug: v.string(),
		feedbackId: v.id("feedback"),
		changes: updateFields,
	},
	returns: v.null(),
	handler: async (ctx, { projectSlug, feedbackId, changes }) => {
		const { project, member, item } = await requireFeedback(
			ctx,
			projectSlug,
			feedbackId,
		);
		if (project.status === "Archived")
			throw new ConvexError("Archived projects cannot be edited.");
		if (changes.category !== undefined || changes.priority !== undefined)
			requireCapability(member.role, "feedback.triage");
		if (changes.assigneeId !== undefined)
			requireCapability(member.role, "feedback.assign");
		if (changes.status !== undefined) {
			requireCapability(member.role, "feedback.update");
			if (member.role === "member" && item.assigneeId !== member.userId)
				throw new ConvexError("Only the assigned member can update this item.");
		}
		// Values are dynamic: they must exist in the taxonomies table.
		const taxonomies = await getTaxonomies(ctx);
		const known = {
			category: new Set(taxonomies.categories.map((entry) => entry.value)),
			priority: new Set(taxonomies.priorities.map((entry) => entry.value)),
			status: new Set(taxonomies.statuses.map((entry) => entry.value)),
		};
		for (const field of ["category", "priority", "status"] as const) {
			if (changes[field] !== undefined && !known[field].has(changes[field]!)) {
				throw new ConvexError(`Unknown ${field}: ${changes[field]}.`);
			}
		}
		let ownerName = "Unassigned";
		if (changes.assigneeId) {
			const assignee = await ctx.db
				.query("memberships")
				.withIndex("by_organizationId_userId", (q) =>
					q
						.eq("organizationId", project.organizationId)
						.eq("userId", changes.assigneeId!),
				)
				.unique();
			const access =
				assignee &&
				(await ctx.db
					.query("projectMembers")
					.withIndex("by_projectId_membershipId", (q) =>
						q.eq("projectId", project._id).eq("membershipId", assignee._id),
					)
					.unique());
			const user = await ctx.db.get("users", changes.assigneeId);
			if (!access || !user)
				throw new ConvexError("Choose an owner who belongs to this project.");
			ownerName = user.name ?? "Former member";
		}
		const now = Date.now();
		let changed = false;
		for (const field of [
			"category",
			"priority",
			"status",
			"assigneeId",
		] as const) {
			if (changes[field] === undefined || changes[field] === item[field])
				continue;
			changed = true;
			await ctx.db.insert("activities", {
				projectId: project._id,
				feedbackId,
				actorId: member.userId,
				type: field === "status" ? "status_changed" : "updated",
				message:
					field === "assigneeId"
						? `Owner set to ${ownerName}`
						: `${field[0].toUpperCase()}${field.slice(1)} set to ${changes[field]}`,
				createdAt: now,
			});
		}
		if (!changed) return null;
		const finals = await getFinalStatuses(ctx);
		await ctx.db.patch("feedback", feedbackId, {
			...changes,
			updatedAt: now,
			...(changes.status !== undefined && changes.status !== item.status
				? { completedAt: finals.has(changes.status) ? now : undefined }
				: {}),
		});
		return null;
	},
});

export const addComment = mutation({
	args: {
		projectSlug: v.string(),
		feedbackId: v.id("feedback"),
		body: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, { projectSlug, feedbackId, body }) => {
		const { project, member } = await requireFeedback(
			ctx,
			projectSlug,
			feedbackId,
		);
		requireCapability(member.role, "feedback.comment");
		if (project.status === "Archived")
			throw new ConvexError("Archived projects cannot be edited.");
		const text = body.trim();
		if (!text || text.length > 5000)
			throw new ConvexError("Write a note between 1 and 5,000 characters.");
		const now = Date.now();
		await ctx.db.insert("comments", {
			feedbackId,
			authorId: member.userId,
			body: text,
			createdAt: now,
		});
		await ctx.db.insert("activities", {
			projectId: project._id,
			feedbackId,
			actorId: member.userId,
			type: "commented",
			message: "Added an internal note",
			createdAt: now,
		});
		await ctx.db.patch("feedback", feedbackId, { updatedAt: now });
		return null;
	},
});
