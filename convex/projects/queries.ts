import { v } from "convex/values";
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

/** Projects the caller can enter, constrained to their organization. */
export const list = query({
	args: {},
	returns: v.array(projectSummary),
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const links = await ctx.db
			.query("projectMembers")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(101);
		const visible = (
			await Promise.all(
				links.map(async (link) => {
					const project = await ctx.db.get("projects", link.projectId);
					if (!project) return null;
					const projectAccess = await resolveProjectAccess(ctx, userId, project._id);
					return projectAccess &&
						hasCapability(projectAccess.permissions, "project.view") &&
						hasCapability(projectAccess.permissions, "feedback.view")
						? project
						: null;
				}),
			)
		).filter((project): project is Doc<"projects"> => project !== null);
		if (visible.length > 100)
			throw new Error("This workspace supports up to 100 projects.");
		return visible
			.map((project) => ({
				slug: project.slug,
				name: project.name,
				description: project.description,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	},
});
