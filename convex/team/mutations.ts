import { ConvexError, v } from "convex/values";

import { resolveProjectAccess } from "../access/roles";
import { mutation } from "../_generated/server";
import { requireCapability, requireProject, requireUserId } from "../feedback/access";
import { getFinalStatuses } from "../taxonomies/lib";

export const setMemberRole = mutation({
	args: {
		projectSlug: v.string(),
		memberId: v.id("users"),
		roleId: v.id("roles"),
	},
	returns: v.null(),
	handler: async (ctx, { projectSlug, memberId, roleId }) => {
		const actorId = await requireUserId(ctx);
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "organization.manage");
		if (memberId === actorId) {
			throw new ConvexError("Choose another administrator to change your own role.");
		}
		const [membership, role] = await Promise.all([
			ctx.db
				.query("projectMembers")
				.withIndex("by_projectId_userId", (q) =>
					q.eq("projectId", project._id).eq("userId", memberId),
				)
				.unique(),
			ctx.db.get("roles", roleId),
		]);
		if (!membership) throw new ConvexError("This person is not a project member.");
		if (!role || (role.projectId !== undefined && role.projectId !== project._id)) {
			throw new ConvexError("This role is not available in this project.");
		}
		if (membership.roleId === roleId) return null;

		const currentAccess = await resolveProjectAccess(ctx, memberId, project._id);
		if (currentAccess?.role === "admin" && role.name !== "admin") {
			const memberships = await ctx.db
				.query("projectMembers")
				.withIndex("by_projectId_userId", (q) => q.eq("projectId", project._id))
				.take(51);
			if (memberships.length > 50) throw new ConvexError("This project supports up to 50 project members.");
			const currentRoles = await Promise.all(
				memberships.map((link) => resolveProjectAccess(ctx, link.userId, project._id)),
			);
			if (currentRoles.filter((candidate) => candidate?.role === "admin").length <= 1) {
				throw new ConvexError("A project must keep at least one administrator.");
			}
		}
		await ctx.db.patch("projectMembers", membership._id, { roleId });
		return null;
	},
});

/**
 * Removes someone from one project. Their open feedback returns to the
 * unassigned queue so nothing silently stalls; closed items keep their owner
 * as history. Organization membership is untouched (other projects remain).
 */
export const removeMember = mutation({
	args: { projectSlug: v.string(), memberId: v.id("users") },
	returns: v.null(),
	handler: async (ctx, { projectSlug, memberId }) => {
		const actorId = await requireUserId(ctx);
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "team.manage");
		if (memberId === actorId) {
			throw new ConvexError("You cannot remove yourself from a project.");
		}
		const membership = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) =>
				q.eq("projectId", project._id).eq("userId", memberId),
			)
			.unique();
		if (!membership) throw new ConvexError("This person is not a project member.");

		const target = await resolveProjectAccess(ctx, memberId, project._id);
		if (target?.role === "admin") {
			const memberships = await ctx.db
				.query("projectMembers")
				.withIndex("by_projectId_userId", (q) => q.eq("projectId", project._id))
				.take(51);
			if (memberships.length > 50) throw new ConvexError("This project supports up to 50 project members.");
			const roles = await Promise.all(
				memberships.map((link) => resolveProjectAccess(ctx, link.userId, project._id)),
			);
			if (roles.filter((candidate) => candidate?.role === "admin").length <= 1) {
				throw new ConvexError("A project must keep at least one administrator.");
			}
		}

		const assigned = await ctx.db
			.query("feedback")
			.withIndex("by_projectId_assigneeId", (q) =>
				q.eq("projectId", project._id).eq("assigneeId", memberId),
			)
			.take(201);
		if (assigned.length > 200) {
			throw new ConvexError("Reassign some of this member's feedback before removing them.");
		}
		const finals = await getFinalStatuses(ctx, project.organizationId);
		const now = Date.now();
		for (const item of assigned) {
			if (finals.has(item.status)) continue;
			await ctx.db.patch("feedback", item._id, { assigneeId: null, updatedAt: now });
			await ctx.db.insert("activities", {
				projectId: project._id,
				feedbackId: item._id,
				actorId,
				type: "updated",
				message: "Owner set to Unassigned",
				createdAt: now,
			});
		}
		await ctx.db.delete("projectMembers", membership._id);
		return null;
	},
});
