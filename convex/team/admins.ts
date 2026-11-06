import { ConvexError } from "convex/values";

import { resolveProjectAccess } from "../access/roles";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { PROJECT_MEMBER_LIMIT } from "../feedback/access";

/**
 * Project administrator invariant: every live project keeps at least one
 * member whose resolved project role is "admin" (the same rule
 * team.mutations.removeMember / setMemberRole enforce for one project).
 * Organization removal, leaving an organization and account deletion use
 * these helpers before they drop someone's project links.
 */

/** True when someone other than `userId` administers the project. */
export async function hasOtherProjectAdmin(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
	userId: Id<"users">,
) {
	const links = await ctx.db
		.query("projectMembers")
		.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId))
		.take(PROJECT_MEMBER_LIMIT + 1);
	if (links.length > PROJECT_MEMBER_LIMIT)
		throw new ConvexError(`This project supports up to ${PROJECT_MEMBER_LIMIT} project members.`);
	for (const link of links) {
		if (link.userId === userId) continue;
		const access = await resolveProjectAccess(ctx, link.userId, projectId);
		if (access?.role === "admin") return true;
	}
	return false;
}

/**
 * The live projects among `projects` that would be left without an
 * administrator if `userId` lost their link: `userId` is an admin there and
 * nobody else is. Projects being deleted are ignored.
 */
export async function soleAdminProjects(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	projects: readonly Doc<"projects">[],
) {
	const orphaned: Doc<"projects">[] = [];
	for (const project of projects) {
		if (project.deletionRequestedAt !== undefined) continue;
		const access = await resolveProjectAccess(ctx, userId, project._id);
		if (access?.role !== "admin") continue;
		if (!(await hasOtherProjectAdmin(ctx, project._id, userId))) orphaned.push(project);
	}
	return orphaned;
}

export function projectNames(projects: readonly Doc<"projects">[]) {
	return projects.map((project) => project.name).join(", ");
}

/**
 * Makes `userId` an administrator of `projectId` (pinned built-in admin
 * role), creating the project link or upgrading the existing one. The
 * caller guarantees `userId` belongs to the project's organization.
 */
export async function grantProjectAdmin(
	ctx: MutationCtx,
	projectId: Id<"projects">,
	userId: Id<"users">,
) {
	const adminRole = await ctx.db
		.query("roles")
		.withIndex("by_projectId_name", (q) => q.eq("projectId", undefined).eq("name", "admin"))
		.unique();
	if (!adminRole) throw new ConvexError("Workspace access is not initialized.");
	const link = await ctx.db
		.query("projectMembers")
		.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId).eq("userId", userId))
		.unique();
	if (link) {
		if (link.roleId !== adminRole._id)
			await ctx.db.patch("projectMembers", link._id, { roleId: adminRole._id });
	} else {
		await ctx.db.insert("projectMembers", {
			projectId,
			userId,
			roleId: adminRole._id,
			joinedAt: Date.now(),
		});
	}
}
