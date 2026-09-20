import { v } from "convex/values";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveUserAccess } from "../access/roles";
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
		const access = await resolveUserAccess(ctx, userId);
		if (
			!access?.user.organizationId ||
			!hasCapability(access.permissions, "project.view") ||
			!hasCapability(access.permissions, "feedback.view")
		)
			return [];

		let visible: Doc<"projects">[];
		if (hasCapability(access.permissions, "organization.manage")) {
			visible = await ctx.db
				.query("projects")
				.withIndex("by_organizationId", (q) =>
					q.eq("organizationId", access.user.organizationId!),
				)
				.take(101);
		} else {
			const links = await ctx.db
				.query("projectMembers")
				.withIndex("by_userId", (q) => q.eq("userId", userId))
				.take(101);
			visible = (
				await Promise.all(links.map((link) => ctx.db.get("projects", link.projectId)))
			).filter(
				(project): project is Doc<"projects"> =>
					project?.organizationId === access.user.organizationId,
			);
		}
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
