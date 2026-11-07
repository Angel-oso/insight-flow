import { ConvexError, v } from "convex/values";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveProjectAccess } from "../access/roles";
import type { Doc } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { requireUserId } from "../feedback/access";

const projectSummary = v.object({
	slug: v.string(),
	name: v.string(),
	description: v.string(),
});

/** Projects listed at once. */
const PROJECT_LIST_LIMIT = 100;
/**
 * Project links read for the caller. Larger than the list limit because
 * links to projects being deleted (kept for 7 days) are skipped, not counted.
 */
const LINK_READ_LIMIT = 200;

/** Projects the caller can enter, constrained to their organization. */
export const list = query({
	args: {},
	returns: v.array(projectSummary),
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const links = await ctx.db
			.query("projectMembers")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(LINK_READ_LIMIT + 1);
		if (links.length > LINK_READ_LIMIT)
			throw new ConvexError(
				`You belong to too many projects to list here (up to ${PROJECT_LIST_LIMIT}). Leave a few projects you no longer use.`,
			);
		const visible = (
			await Promise.all(
				links.map(async (link) => {
					const project = await ctx.db.get("projects", link.projectId);
					// Skipped cheaply; resolveProjectAccess would refuse it anyway.
					if (!project || project.deletionRequestedAt !== undefined) return null;
					const projectAccess = await resolveProjectAccess(ctx, userId, project._id);
					return projectAccess &&
						hasCapability(projectAccess.permissions, "project.view") &&
						hasCapability(projectAccess.permissions, "feedback.view")
						? project
						: null;
				}),
			)
		).filter((project): project is Doc<"projects"> => project !== null);
		if (visible.length > PROJECT_LIST_LIMIT)
			throw new ConvexError(
				`You can see up to ${PROJECT_LIST_LIMIT} projects here. Leave a few projects you no longer use.`,
			);
		return visible
			.map((project) => ({
				slug: project.slug,
				name: project.name,
				description: project.description,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	},
});
