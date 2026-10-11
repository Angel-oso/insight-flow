import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveOrganizationAccess, resolveProjectAccess } from "../access/roles";

/**
 * Access gate for the authenticated app shell. The client renders the
 * workspace only when `hasMembership` is true; otherwise it shows a
 * no-workspace notice. Every decision here is server-side so the client
 * cannot talk itself into access.
 */
export const status = query({
	args: {},
	returns: v.object({
		authenticated: v.boolean(),
		hasMembership: v.boolean(),
		canCreateWorkspace: v.boolean(),
	}),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			return { authenticated: false, hasMembership: false, canCreateWorkspace: false };
		}
		const user = await ctx.db.get("users", userId);
		if (!user) {
			return { authenticated: true, hasMembership: false, canCreateWorkspace: false };
		}
		let hasWorkspace = false;
		const links = await ctx.db.query("projectMembers")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(51);
		for (const link of links) {
			const project = await ctx.db.get("projects", link.projectId);
			if (!project) continue;
			const projectAccess = await resolveProjectAccess(ctx, userId, project._id);
			if (
				projectAccess &&
				hasCapability(projectAccess.permissions, "project.view") &&
				hasCapability(projectAccess.permissions, "feedback.view")
			) {
				hasWorkspace = true;
				break;
			}
		}
		if (!hasWorkspace) {
			const memberships = await ctx.db.query("organizationMembers")
				.withIndex("by_userId", (q) => q.eq("userId", userId)).take(101);
			for (const membership of memberships) {
				if (await resolveOrganizationAccess(ctx, userId, membership.organizationId)) {
					hasWorkspace = true;
					break;
				}
			}
		}
		return {
			authenticated: true,
			hasMembership: hasWorkspace,
			canCreateWorkspace: true,
		};
	},
});
