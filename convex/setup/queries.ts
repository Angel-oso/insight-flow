import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveUserAccess } from "../access/roles";

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
	}),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return { authenticated: false, hasMembership: false };
		const access = await resolveUserAccess(ctx, userId);
		if (!access?.user.organizationId ||
			!hasCapability(access.permissions, "project.view") ||
			!hasCapability(access.permissions, "feedback.view"))
			return { authenticated: true, hasMembership: false };
		const organization = await ctx.db.get("organizations", access.user.organizationId);
		if (!organization) return { authenticated: true, hasMembership: false };
		let hasWorkspace = false;
		if (hasCapability(access.permissions, "organization.manage")) {
			hasWorkspace = (await ctx.db.query("projects")
				.withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
				.first()) !== null;
		} else {
			const links = await ctx.db.query("projectMembers")
				.withIndex("by_userId", (q) => q.eq("userId", userId))
				.take(51);
			for (const link of links) {
				const project = await ctx.db.get("projects", link.projectId);
				if (project?.organizationId === organization._id) {
					hasWorkspace = true;
					break;
				}
			}
		}
		return {
			authenticated: true,
			hasMembership: hasWorkspace,
		};
	},
});
