import { ConvexError, v } from "convex/values";
import { query } from "../_generated/server";
import {
	listProjectFeedback,
	requireFeedback,
	requireProject,
} from "./access";
import { getTaxonomies, taxonomiesValidator } from "../taxonomies/lib";
import schema from "../schema";

export const workspace = query({
	args: { projectSlug: v.string() },
	returns: v.object({
		project: schema.doc("projects"),
		role: schema.tables.memberships.validator.fields.role,
		items: v.array(schema.doc("feedback")),
		assignees: v.array(schema.doc("users")),
		taxonomies: taxonomiesValidator,
	}),
	handler: async (ctx, { projectSlug }) => {
		const { project, member } = await requireProject(ctx, projectSlug);
		const items = await listProjectFeedback(ctx, project._id);
		// Keep the sample bounded without silently dropping rows or misreporting totals.
		const links = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_membershipId", (q) =>
				q.eq("projectId", project._id),
			)
			.take(51);
		if (links.length > 50)
			throw new ConvexError("This workspace supports up to 50 project members.");
		const assignees = [];
		for (const link of links) {
			const membership = await ctx.db.get("memberships", link.membershipId);
			if (!membership || membership.organizationId !== project.organizationId)
				continue;
			const user = await ctx.db.get("users", membership.userId);
			if (user) assignees.push(user);
		}
		const taxonomies = await getTaxonomies(ctx);
		return { project, role: member.role, items, assignees, taxonomies };
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
