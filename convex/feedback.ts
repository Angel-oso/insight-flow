import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
	requireCapability,
	requireFeedback,
	requireProject,
} from "./feedback/access";
import schema from "./schema";

const updateFields = schema.tables.feedback.validator
	.pick("category", "priority", "status", "assigneeId")
	.partial();

export const workspace = query({
	args: { projectSlug: v.string() },
	returns: v.object({
		project: schema.doc("projects"),
		role: schema.tables.memberships.validator.fields.role,
		items: v.array(schema.doc("feedback")),
		assignees: v.array(schema.doc("users")),
	}),
	handler: async (ctx, { projectSlug }) => {
		const { project, member } = await requireProject(ctx, projectSlug);
		const items = await ctx.db
			.query("feedback")
			.withIndex("by_projectId_receivedAt", (q) =>
				q.eq("projectId", project._id),
			)
			.order("desc")
			.take(201);
		// Keep the sample bounded without silently dropping rows or misreporting totals.
		if (items.length > 200)
			throw new ConvexError(
				"This demo supports up to 200 feedback items per project.",
			);
		const links = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_membershipId", (q) =>
				q.eq("projectId", project._id),
			)
			.take(51);
		if (links.length > 50)
			throw new ConvexError("This demo supports up to 50 project members.");
		const assignees = [];
		for (const link of links) {
			const membership = await ctx.db.get("memberships", link.membershipId);
			if (!membership || membership.organizationId !== project.organizationId)
				continue;
			const user = await ctx.db.get("users", membership.userId);
			if (user) assignees.push(user);
		}
		return { project, role: member.role, items, assignees };
	},
});

export const detail = query({
	args: { projectSlug: v.string(), feedbackId: v.id("feedback") },
	returns: v.object({
		item: schema.doc("feedback"),
		comments: v.array(
			v.object({ ...schema.doc("comments").fields, author: v.string() }),
		),
		activities: v.array(schema.doc("activities")),
	}),
	handler: async (ctx, { projectSlug, feedbackId }) => {
		const { item } = await requireFeedback(ctx, projectSlug, feedbackId);
		const rows = await ctx.db
			.query("comments")
			.withIndex("by_feedbackId_createdAt", (q) =>
				q.eq("feedbackId", feedbackId),
			)
			.order("desc")
			.take(100);
		const comments = await Promise.all(
			rows.map(async (row) => ({
				...row,
				author:
					(await ctx.db.get("users", row.authorId))?.name ?? "Former member",
			})),
		);
		const activities = await ctx.db
			.query("activities")
			.withIndex("by_feedbackId_createdAt", (q) =>
				q.eq("feedbackId", feedbackId),
			)
			.order("desc")
			.take(100);
		return { item, comments, activities };
	},
});

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
			ownerName = user.name;
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
		await ctx.db.patch("feedback", feedbackId, {
			...changes,
			updatedAt: now,
			...(changes.status !== undefined && changes.status !== item.status
				? { completedAt: changes.status === "Completed" ? now : undefined }
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
