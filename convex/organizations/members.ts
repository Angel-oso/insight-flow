import { ConvexError, v } from "convex/values";
import { resolveOrganizationAccess, resolveProjectAccess } from "../access/roles";
import { logAudit } from "../audit/log";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { capMessage, fullScopeFor } from "../invitations/caps";
import { revokeCreatorLinks } from "../invitations/mutations";
import { deletePreferenceRow } from "../notifications/preferences";
import { enforceUserRateLimit } from "../rateLimits";
import schema from "../schema";
import { grantProjectAdmin, projectNames, soleAdminProjects } from "../team/admins";
import { requireOrganization } from "./access";

/** Members read at once by the settings list and the admin check. */
export const ORGANIZATION_MEMBER_LIMIT = 200;
/** Project links (across organizations) read for one person. */
const PERSON_PROJECT_LINK_LIMIT = 200;
/** Projects of one organization scanned for the leaver's pending links. */
const ORGANIZATION_PROJECT_LIMIT = 200;

/**
 * Removes `userId` from one organization: every project link in it, the
 * pending invitation links they created there, their notification
 * preferences for its projects, and the membership itself.
 * Their open feedback returns to the unassigned queue through the existing
 * `team.mutations.releaseAssignments` batches (one scheduled job per
 * project). Callers own authorization and the owner/admin invariants.
 *
 * Projects never lose their last administrator: when `userId` is the only
 * admin of a project here, the removal is refused (with `refusal` as the
 * message, if given), unless `handOrphansTo` is set; then that member
 * becomes the project's admin. An organization administrator removing
 * someone cannot otherwise enter a project they are not part of to appoint
 * a successor.
 */
export async function removeFromOrganization(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	userId: Id<"users">,
	actorId: Id<"users">,
	options: { handOrphansTo?: Id<"users">; refusal?: (names: string) => string } = {},
) {
	const links = await ctx.db
		.query("projectMembers")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.take(PERSON_PROJECT_LINK_LIMIT + 1);
	if (links.length > PERSON_PROJECT_LINK_LIMIT)
		throw new ConvexError(`This person belongs to more than ${PERSON_PROJECT_LINK_LIMIT} projects.`);
	const linked: { link: Doc<"projectMembers">; project: Doc<"projects"> }[] = [];
	for (const link of links) {
		const project = await ctx.db.get("projects", link.projectId);
		if (project?.organizationId === organizationId) linked.push({ link, project });
	}
	const orphaned = await soleAdminProjects(ctx, userId, linked.map(({ project }) => project));
	if (orphaned.length > 0 && options.handOrphansTo === undefined) {
		const names = projectNames(orphaned);
		throw new ConvexError(
			options.refusal?.(names) ??
				`This person is the only administrator of ${names}. Make someone else an administrator there first.`,
		);
	}
	for (const { link, project } of linked) {
		await ctx.db.delete("projectMembers", link._id);
		await ctx.scheduler.runAfter(0, internal.team.mutations.releaseAssignments, {
			projectId: project._id,
			memberId: userId,
			actorId,
		});
	}
	if (options.handOrphansTo !== undefined)
		for (const project of orphaned) await grantProjectAdmin(ctx, project._id, options.handOrphansTo);
	// Pending links they created anywhere in this organization (also in
	// projects they already left), read per project through the pending
	// index; larger backlogs continue in scheduled batches. Their
	// notification preferences there (one row per project at most) go too.
	const projects = await ctx.db
		.query("projects")
		.withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
		.take(ORGANIZATION_PROJECT_LIMIT);
	for (const project of projects) {
		await revokeCreatorLinks(ctx, project._id, userId);
		await deletePreferenceRow(ctx, userId, project._id);
	}
	const membership = await ctx.db
		.query("organizationMembers")
		.withIndex("by_organizationId_userId", (q) =>
			q.eq("organizationId", organizationId).eq("userId", userId),
		)
		.unique();
	if (membership) await ctx.db.delete("organizationMembers", membership._id);
}

async function organizationAdminCount(ctx: MutationCtx, organizationId: Id<"organizations">) {
	const memberships = await ctx.db
		.query("organizationMembers")
		.withIndex("by_organizationId_userId", (q) => q.eq("organizationId", organizationId))
		.take(ORGANIZATION_MEMBER_LIMIT + 1);
	if (memberships.length > ORGANIZATION_MEMBER_LIMIT)
		throw new ConvexError(`This organization supports up to ${ORGANIZATION_MEMBER_LIMIT} members.`);
	const access = await Promise.all(
		memberships.map((membership) => resolveOrganizationAccess(ctx, membership.userId, organizationId)),
	);
	return access.filter((entry) => entry?.permissions.includes("organization.manage")).length;
}

/** Shared invariants for removing or leaving: owner stays, ≥1 admin stays. */
async function assertRemovable(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	ownerId: Id<"users">,
	targetId: Id<"users">,
) {
	if (targetId === ownerId)
		throw new ConvexError("The organization owner cannot be removed. Transfer ownership first.");
	const target = await resolveOrganizationAccess(ctx, targetId, organizationId);
	if (!target) throw new ConvexError("This person is not an organization member.");
	if (
		target.permissions.includes("organization.manage") &&
		(await organizationAdminCount(ctx, organizationId)) <= 1
	)
		throw new ConvexError("An organization must keep at least one administrator.");
}

/** Organization roster for administrators (names and emails are admin-only). */
export const list = query({
	args: { organizationId: v.id("organizations") },
	returns: v.array(
		v.object({
			id: v.id("users"),
			name: v.string(),
			email: v.string(),
			role: schema.tables.roles.validator.fields.name,
			isOwner: v.boolean(),
			isYou: v.boolean(),
		}),
	),
	handler: async (ctx, { organizationId }) => {
		const { userId, organization } = await requireOrganization(ctx, organizationId, true);
		const memberships = await ctx.db
			.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) => q.eq("organizationId", organizationId))
			.take(ORGANIZATION_MEMBER_LIMIT + 1);
		if (memberships.length > ORGANIZATION_MEMBER_LIMIT)
			throw new ConvexError(`This list supports up to ${ORGANIZATION_MEMBER_LIMIT} organization members.`);
		const rows = await Promise.all(
			memberships.map(async (membership) => {
				const access = await resolveOrganizationAccess(ctx, membership.userId, organizationId);
				if (!access) return null;
				return {
					id: membership.userId,
					name: access.user.name ?? "Team member",
					email: access.user.email ?? "",
					role: access.role,
					isOwner: membership.userId === organization.ownerId,
					isYou: membership.userId === userId,
				};
			}),
		);
		return rows
			.filter((row) => row !== null)
			.sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name));
	},
});

/**
 * Organization administrators remove someone from the whole organization
 * (all of its projects). The owner cannot be removed, nobody removes
 * themselves here (they leave instead) and one administrator always stays.
 */
export const removeMember = mutation({
	args: { organizationId: v.id("organizations"), userId: v.id("users") },
	returns: v.null(),
	handler: async (ctx, { organizationId, userId: targetId }) => {
		await enforceUserRateLimit(ctx, "manageMembership");
		const { userId, organization } = await requireOrganization(ctx, organizationId, true);
		if (targetId === userId)
			throw new ConvexError("Use Leave organization to remove yourself.");
		await assertRemovable(ctx, organizationId, organization.ownerId, targetId);
		const target = await ctx.db.get("users", targetId);
		// Projects they alone administer pass to the administrator removing them.
		await removeFromOrganization(ctx, organizationId, targetId, userId, { handOrphansTo: userId });
		await logAudit(ctx, {
			organizationId,
			actorId: userId,
			action: "organization.member_removed",
			targetUserId: targetId,
			summary: `Removed ${displayName(target)} from the organization`,
		});
		return null;
	},
});

/** The caller leaves an organization they do not own. */
export const leave = mutation({
	args: { organizationId: v.id("organizations") },
	returns: v.null(),
	handler: async (ctx, { organizationId }) => {
		await enforceUserRateLimit(ctx, "manageMembership");
		const { userId, organization } = await requireOrganization(ctx, organizationId);
		if (userId === organization.ownerId)
			throw new ConvexError("The owner cannot leave. Transfer ownership or delete the organization first.");
		await assertRemovable(ctx, organizationId, organization.ownerId, userId);
		await removeFromOrganization(ctx, organizationId, userId, userId, {
			refusal: (names) =>
				`You are the only administrator of ${names}. Make another member an administrator there (or invite the organization owner as one) before leaving.`,
		});
		await logAudit(ctx, {
			organizationId,
			actorId: userId,
			action: "organization.member_left",
			targetUserId: userId,
			summary: "Left the organization",
		});
		return null;
	},
});

function displayName(user: Doc<"users"> | null) {
	return user?.name ?? "a team member";
}

const organizationRoleName = v.union(v.literal("admin"), v.literal("manager"), v.literal("member"));

/** One of the three built-in roles (no projectId), the only organization roles. */
async function builtInRole(ctx: QueryCtx | MutationCtx, name: "admin" | "manager" | "member") {
	return ctx.db
		.query("roles")
		.withIndex("by_projectId_name", (q) => q.eq("projectId", undefined).eq("name", name))
		.unique();
}

/**
 * Organization administrators change someone's organization role (admin,
 * manager or member). The owner always stays an administrator and the
 * organization always keeps at least one. Project links that inherit the
 * organization role (no pinned role) follow the change, so a demotion that
 * would leave such a project without an administrator is refused.
 */
export const setRole = mutation({
	args: { organizationId: v.id("organizations"), userId: v.id("users"), role: organizationRoleName },
	returns: v.null(),
	handler: async (ctx, { organizationId, userId: targetId, role: roleName }) => {
		await enforceUserRateLimit(ctx, "manageMembership");
		const { userId, organization } = await requireOrganization(ctx, organizationId, true);
		const membership = await ctx.db
			.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) =>
				q.eq("organizationId", organizationId).eq("userId", targetId),
			)
			.unique();
		if (!membership) throw new ConvexError("This person is not an organization member.");
		const role = await builtInRole(ctx, roleName);
		if (!role) throw new ConvexError("Workspace roles are not initialized.");
		if (membership.roleIds.length === 1 && membership.roleIds[0] === role._id) return null;

		const current = await resolveOrganizationAccess(ctx, targetId, organizationId);
		const target = await ctx.db.get("users", targetId);
		if (roleName !== "admin") {
			if (targetId === organization.ownerId)
				throw new ConvexError("The organization owner must stay an administrator. Transfer ownership first.");
			if (current?.permissions.includes("organization.manage")) {
				if ((await organizationAdminCount(ctx, organizationId)) <= 1)
					throw new ConvexError("An organization must keep at least one administrator.");
				const orphaned = await inheritedSoleAdminProjects(ctx, organizationId, targetId);
				if (orphaned.length > 0)
					throw new ConvexError(
						`${displayName(target)} is the only administrator of ${projectNames(orphaned)}. Make someone else an administrator there first.`,
					);
			}
		}
		await ctx.db.patch("organizationMembers", membership._id, { roleIds: [role._id] });
		await logAudit(ctx, {
			organizationId,
			actorId: userId,
			action: "organization.role_changed",
			targetUserId: targetId,
			summary: `Changed ${displayName(target)}'s organization role from ${current?.role ?? "none"} to ${roleName}`,
		});
		return null;
	},
});

/**
 * Projects in this organization that `userId` administers only through
 * their organization role (an unpinned project link) and nobody else does.
 */
async function inheritedSoleAdminProjects(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	userId: Id<"users">,
) {
	const links = await ctx.db
		.query("projectMembers")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.take(PERSON_PROJECT_LINK_LIMIT + 1);
	if (links.length > PERSON_PROJECT_LINK_LIMIT)
		throw new ConvexError(`This person belongs to more than ${PERSON_PROJECT_LINK_LIMIT} projects.`);
	const inherited: Doc<"projects">[] = [];
	for (const link of links) {
		if (link.roleId !== undefined) continue;
		const project = await ctx.db.get("projects", link.projectId);
		if (project?.organizationId === organizationId) inherited.push(project);
	}
	return soleAdminProjects(ctx, userId, inherited);
}

/**
 * An organization administrator (re)joins a project of their organization
 * as its administrator, e.g. after a project admin removed them or for a
 * project they were never added to. Projects are organization property.
 */
export const joinProject = mutation({
	args: { organizationId: v.id("organizations"), projectSlug: v.string() },
	returns: v.object({ projectSlug: v.string() }),
	handler: async (ctx, { organizationId, projectSlug }) => {
		await enforceUserRateLimit(ctx, "manageMembership");
		const { userId } = await requireOrganization(ctx, organizationId, true);
		if (projectSlug.length > 100) throw new ConvexError("Project not found.");
		const project = await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", projectSlug))
			.unique();
		if (!project || project.organizationId !== organizationId || project.deletionRequestedAt !== undefined)
			throw new ConvexError("Project not found.");
		const current = await resolveProjectAccess(ctx, userId, project._id);
		if (current?.role === "admin") return { projectSlug: project.slug };
		const full = await fullScopeFor(ctx, project, userId);
		if (full) throw new ConvexError(capMessage(full));
		await grantProjectAdmin(ctx, project._id, userId);
		await logAudit(ctx, {
			organizationId,
			projectId: project._id,
			actorId: userId,
			action: "project.admin_joined",
			targetUserId: userId,
			summary: `Joined ${project.name} as an administrator`,
		});
		return { projectSlug: project.slug };
	},
});
