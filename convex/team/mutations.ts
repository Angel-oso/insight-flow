import { ConvexError, v } from "convex/values";

import { hasCapability, type Capability } from "../../lib/auth/permissions";
import {
	exceedsGrants,
	resolveOrganizationAccess,
	resolveProjectAccess,
	rolePermissions,
} from "../access/roles";
import { logAudit } from "../audit/log";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "../_generated/server";
import {
	PROJECT_MEMBER_LIMIT,
	requireCapability,
	requireProject,
	requireUserId,
} from "../feedback/access";
import { patchFeedbackRow } from "../feedback/store";
import { deletePendingLinksBy, revokeCreatorLinks } from "../invitations/mutations";
import { deletePreferenceRow } from "../notifications/preferences";
import { getFinalStatuses } from "../taxonomies/lib";

/**
 * Project admins manage their project's team, but not the people who run
 * the organization: the owner and organization administrators can only be
 * demoted or removed in a project by another organization administrator.
 * (Organization administrators can always rejoin a project through
 * organizations.members.joinProject.)
 */
async function assertMayManageMember(
	ctx: MutationCtx,
	organization: Doc<"organizations">,
	actorId: Id<"users">,
	memberId: Id<"users">,
) {
	const actor = await resolveOrganizationAccess(ctx, actorId, organization._id);
	if (actor && hasCapability(actor.permissions, "organization.manage")) return;
	const target =
		memberId === organization.ownerId
			? null
			: await resolveOrganizationAccess(ctx, memberId, organization._id);
	if (
		memberId === organization.ownerId ||
		(target && hasCapability(target.permissions, "organization.manage"))
	)
		throw new ConvexError(
			"Only organization administrators can change the project access of an organization administrator.",
		);
}

export const setMemberRole = mutation({
	args: {
		projectSlug: v.string(),
		memberId: v.id("users"),
		roleId: v.id("roles"),
	},
	returns: v.null(),
	handler: async (ctx, { projectSlug, memberId, roleId }) => {
		const actorId = await requireUserId(ctx);
		const { project, access, organization } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "organization.manage");
		if (project.status === "Archived")
			throw new ConvexError("Archived projects cannot be edited.");
		if (memberId === actorId) {
			throw new ConvexError("Choose another administrator to change your own role.");
		}
		await assertMayManageMember(ctx, organization, actorId, memberId);
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
				.take(PROJECT_MEMBER_LIMIT + 1);
			if (memberships.length > PROJECT_MEMBER_LIMIT)
				throw new ConvexError(`This project supports up to ${PROJECT_MEMBER_LIMIT} project members.`);
			const currentRoles = await Promise.all(
				memberships.map((link) => resolveProjectAccess(ctx, link.userId, project._id)),
			);
			if (currentRoles.filter((candidate) => candidate?.role === "admin").length <= 1) {
				throw new ConvexError("A project must keep at least one administrator.");
			}
		}
		await ctx.db.patch("projectMembers", membership._id, { roleId });
		const member = await ctx.db.get("users", memberId);
		await logAudit(ctx, {
			organizationId: organization._id,
			projectId: project._id,
			actorId,
			action: "project.member_role_changed",
			targetUserId: memberId,
			summary: `Changed ${member?.name ?? "a team member"}'s role in ${project.name} from ${currentAccess?.role ?? "none"} to ${role.name}`,
		});
		// A demoted member's pending links must not keep handing out access
		// they no longer hold (accept re-checks too; this cleans the list).
		const updated = await resolveProjectAccess(ctx, memberId, project._id);
		const canInvite = updated !== null && hasCapability(updated.permissions, "team.manage");
		const permissionsByRole = new Map<Id<"roles">, readonly Capability[]>();
		await deletePendingLinksBy(ctx, project._id, memberId, async (linkRoleId) => {
			if (!canInvite) return true;
			let granted = permissionsByRole.get(linkRoleId);
			if (!granted) {
				const linkRole = await ctx.db.get("roles", linkRoleId);
				granted = linkRole ? await rolePermissions(ctx, linkRole) : [];
				permissionsByRole.set(linkRoleId, granted);
			}
			return exceedsGrants(granted, updated.permissions);
		});
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
		const { project, access, organization } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "team.manage");
		if (project.status === "Archived")
			throw new ConvexError("Archived projects cannot be edited.");
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
		if (target && exceedsGrants(target.permissions, access.permissions)) {
			throw new ConvexError("You cannot remove someone with more access than your own.");
		}
		await assertMayManageMember(ctx, organization, actorId, memberId);
		if (target?.role === "admin") {
			const memberships = await ctx.db
				.query("projectMembers")
				.withIndex("by_projectId_userId", (q) => q.eq("projectId", project._id))
				.take(PROJECT_MEMBER_LIMIT + 1);
			if (memberships.length > PROJECT_MEMBER_LIMIT)
				throw new ConvexError(`This project supports up to ${PROJECT_MEMBER_LIMIT} project members.`);
			const roles = await Promise.all(
				memberships.map((link) => resolveProjectAccess(ctx, link.userId, project._id)),
			);
			if (roles.filter((candidate) => candidate?.role === "admin").length <= 1) {
				throw new ConvexError("A project must keep at least one administrator.");
			}
		}

		await ctx.db.delete("projectMembers", membership._id);
		await deletePreferenceRow(ctx, memberId, project._id);
		await logAudit(ctx, {
			organizationId: organization._id,
			projectId: project._id,
			actorId,
			action: "project.member_removed",
			targetUserId: memberId,
			summary: `Removed ${target?.user.name ?? "a team member"} from ${project.name}`,
		});
		// Links they created stop working at once (accept re-checks the
		// creator); drop them from the pending list too.
		await revokeCreatorLinks(ctx, project._id, memberId);
		// Large queues are released in bounded batches; the rest continue in
		// scheduled transactions so removal never fails on a busy member.
		const next = await releaseOpenAssignments(ctx, project, memberId, actorId, null);
		if (next !== null)
			await ctx.scheduler.runAfter(0, internal.team.mutations.releaseAssignments, {
				projectId: project._id,
				memberId,
				actorId,
				cursor: next,
			});
		return null;
	},
});

const RELEASE_BATCH = 100;

/**
 * Returns the removed member's open feedback to the unassigned queue, one
 * page (RELEASE_BATCH rows) of their assigned items per call. It walks the
 * assignee index rather than the current status list, so items whose status
 * was since removed from the taxonomy are released too; only statuses known
 * to be final keep their owner as history. Returns the cursor to continue
 * from, or null when nothing is left.
 */
async function releaseOpenAssignments(
	ctx: MutationCtx,
	project: Doc<"projects">,
	memberId: Id<"users">,
	actorId: Id<"users">,
	cursor: string | null,
) {
	const finals = await getFinalStatuses(ctx, project.organizationId);
	const now = Date.now();
	const page = await ctx.db
		.query("feedback")
		.withIndex("by_projectId_assigneeId_receivedAt", (q) =>
			q.eq("projectId", project._id).eq("assigneeId", memberId),
		)
		.paginate({ numItems: RELEASE_BATCH, cursor });
	for (const item of page.page) {
		if (finals.has(item.status)) continue;
		await patchFeedbackRow(ctx, item._id, { assigneeId: null, updatedAt: now });
		await ctx.db.insert("activities", {
			projectId: project._id,
			feedbackId: item._id,
			actorId,
			type: "updated",
			message: "Owner set to Unassigned",
			createdAt: now,
		});
	}
	return page.isDone ? null : page.continueCursor;
}

/** Continuation of removeMember for members with very large queues. */
export const releaseAssignments = internalMutation({
	args: {
		projectId: v.id("projects"),
		memberId: v.id("users"),
		actorId: v.id("users"),
		cursor: v.optional(v.union(v.string(), v.null())),
	},
	returns: v.null(),
	handler: async (ctx, { projectId, memberId, actorId, cursor }) => {
		const project = await ctx.db.get("projects", projectId);
		if (!project) return null;
		// Re-added in the meantime: their remaining work stays theirs.
		const rejoined = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId).eq("userId", memberId))
			.unique();
		if (rejoined) return null;
		const next = await releaseOpenAssignments(ctx, project, memberId, actorId, cursor ?? null);
		if (next !== null)
			await ctx.scheduler.runAfter(0, internal.team.mutations.releaseAssignments, {
				projectId,
				memberId,
				actorId,
				cursor: next,
			});
		return null;
	},
});
