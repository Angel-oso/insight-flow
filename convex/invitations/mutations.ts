import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { hasCapability } from "../../lib/auth/permissions";
import { resolveProjectAccess } from "../access/roles";
import { internalMutation, mutation } from "../_generated/server";
import schema from "../schema";

const expiryHours = v.union(v.literal(1), v.literal(6), v.literal(24));

export const create = internalMutation({
	args: {
		creatorId: v.id("users"),
		projectSlug: v.string(),
		roleId: v.id("roles"),
		expiresInHours: expiryHours,
		token: v.string(),
		expiresAt: v.number(),
	},
	returns: v.object({ token: v.string(), expiresAt: v.number() }),
	handler: async (ctx, args) => {
		const project = await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", args.projectSlug))
			.unique();
		if (!project) throw new ConvexError("Project not found.");
		const creator = await resolveProjectAccess(ctx, args.creatorId, project._id);
		if (!creator || !hasCapability(creator.permissions, "team.manage")) {
			throw new ConvexError("You cannot invite members to this project.");
		}
		const role = await ctx.db.get("roles", args.roleId);
		if (!role || (role.projectId !== undefined && role.projectId !== project._id)) {
			throw new ConvexError("This role is not available.");
		}
		if (args.expiresAt <= Date.now() || args.expiresInHours > 24) {
			throw new ConvexError("Invitation links can expire in at most one day.");
		}
		await ctx.db.insert("projectInvitations", {
			projectId: project._id,
			roleId: role._id,
			token: args.token,
			createdBy: args.creatorId,
			expiresAt: args.expiresAt,
		});
		return { token: args.token, expiresAt: args.expiresAt };
	},
});

/** Accept the link for the signed-in user; tokens never carry a user id. */
export const accept = mutation({
	args: { token: v.string() },
	returns: v.object({ projectSlug: v.string() }),
	handler: async (ctx, { token }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Sign in to accept this invitation.");
		const invitation = await ctx.db
			.query("projectInvitations")
			.withIndex("by_token", (q) => q.eq("token", token))
			.unique();
		if (!invitation) throw new ConvexError("This invitation link is invalid.");
		if (invitation.acceptedAt) throw new ConvexError("This invitation has already been used.");
		if (invitation.expiresAt <= Date.now()) throw new ConvexError("This invitation has expired.");
		const [user, project, role] = await Promise.all([
			ctx.db.get("users", userId),
			ctx.db.get("projects", invitation.projectId),
			ctx.db.get("roles", invitation.roleId),
		]);
		if (!user || !project || !role) throw new ConvexError("This invitation is no longer available.");
		const existingMembership = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) =>
				q.eq("projectId", project._id).eq("userId", userId),
			)
			.unique();
		if (!existingMembership) {
			const memberRole = await ctx.db
				.query("roles")
				.withIndex("by_name", (q) => q.eq("name", "member"))
				.unique();
			if (!memberRole) throw new ConvexError("Workspace access is not initialized.");
			const organizationMembership = await ctx.db
				.query("organizationMembers")
				.withIndex("by_organizationId_userId", (q) =>
					q.eq("organizationId", project.organizationId).eq("userId", userId),
				)
				.unique();
			if (!organizationMembership) {
				await ctx.db.insert("organizationMembers", {
					organizationId: project.organizationId,
					userId,
					roleIds: [memberRole._id],
				});
			}
			await ctx.db.insert("projectMembers", {
				projectId: project._id,
				userId,
				roleId: role._id,
				joinedAt: Date.now(),
			});
		}
		await ctx.db.patch("projectInvitations", invitation._id, { acceptedAt: Date.now() });
		return { projectSlug: project.slug };
	},
});
