import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { hasInboxCapacity, insertFeedback } from "../feedback/create";
import { getTaxonomies } from "../taxonomies/lib";

export const form = query({
	args: { projectSlug: v.string() },
	returns: v.union(v.null(), v.object({
		name: v.string(),
		description: v.string(),
		accepting: v.boolean(),
		categories: v.array(v.object({ value: v.string(), label: v.string(), description: v.optional(v.string()) })),
	})),
	handler: async (ctx, { projectSlug }) => {
		const project = await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique();
		if (!project) return null;
		const { categories } = await getTaxonomies(ctx, project.organizationId);
		return {
			name: project.name,
			description: project.description,
			accepting:
				project.status === "Active" &&
				project.inboxEnabled &&
				(await hasInboxCapacity(ctx, project._id)),
			categories: [...categories].sort((a, b) => a.rank - b.rank).map((item) => ({
				value: item.value,
				label: item.label,
				...(item.description !== undefined ? { description: item.description } : {}),
			})),
		};
	},
});

export const submit = mutation({
	args: {
		projectSlug: v.string(), title: v.string(), description: v.string(), category: v.string(),
		senderName: v.optional(v.string()), senderEmail: v.optional(v.string()), website: v.optional(v.string()),
	},
	returns: v.object({ reference: v.string() }),
	handler: async (ctx, { projectSlug, website, ...fields }) => {
		const project = await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique();
		if (!project || project.status !== "Active" || !project.inboxEnabled)
			throw new ConvexError("This feedback link is not accepting submissions.");
		if (website) return { reference: `received-${Date.now().toString(36)}` };
		const feedbackId = await insertFeedback(ctx, {
			project, ...fields, actorId: null, message: "Received through the public link",
		});
		return { reference: String(feedbackId) };
	},
});
