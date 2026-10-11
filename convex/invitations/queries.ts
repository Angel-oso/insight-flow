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
			status: v.union(
				v.literal("active"),
				v.literal("expired"),
				v.literal("accepted"),
			),
		}),
		v.null(),
	),
	handler: async (ctx, { token }) => {
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
		const status: "active" | "expired" | "accepted" = invitation.acceptedAt
			? "accepted"
			: invitation.expiresAt <= Date.now()
				? "expired"
				: "active";
		return {
			projectName: project.name,
			projectSlug: project.slug,
			role: role.name,
			expiresAt: invitation.expiresAt,
			status,
		};
	},
});
