import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { query } from "../_generated/server";
import schema from "../schema";

export const preview = query({
	args: { token: v.string() },
	returns: v.union(
		v.object({
			projectName: v.string(),
			projectSlug: v.string(),
			role: schema.tables.roles.validator.fields.name,
			expiresAt: v.number(),
			// Expiry is derived on the client from expiresAt: queries never
			// read the clock, so a cached result cannot go stale.
			status: v.union(v.literal("pending"), v.literal("accepted")),
		}),
		v.null(),
	),
	handler: async (ctx, { token }) => {
		// Only signed-in visitors (the invitee) can read invitation details.
		if (!(await getAuthUserId(ctx))) return null;
		const invitation = await ctx.db
			.query("projectInvitations")
			.withIndex("by_token", (q) => q.eq("token", token))
			.unique();
		if (!invitation) return null;
		const [project, role] = await Promise.all([
			ctx.db.get("projects", invitation.projectId),
			ctx.db.get("roles", invitation.roleId),
		]);
		if (!project || !role) return null;
		const status = invitation.acceptedAt ? ("accepted" as const) : ("pending" as const);
		return {
			projectName: project.name,
			projectSlug: project.slug,
			role: role.name,
			expiresAt: invitation.expiresAt,
			status,
		};
	},
});
