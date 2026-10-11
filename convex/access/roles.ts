import type { Capability, Role } from "../../lib/auth/permissions";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const roleRank: Record<Role, number> = {
	admin: 3,
	manager: 2,
	member: 1,
};

type ResolvedAccess = {
	user: Doc<"users">;
	roleId: Id<"roles">;
	role: string;
	permissions: Capability[];
};

async function organizationMembership(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	organizationId: Id<"organizations">,
) {
	return ctx.db
		.query("organizationMembers")
		.withIndex("by_organizationId_userId", (q) =>
			q.eq("organizationId", organizationId).eq("userId", userId),
		)
		.unique();
}

/**
 * Organization access comes only from `organizationMembers`. The legacy
 * `users.organizationId` / `users.roleIds` fields never grant anything.
 */
export async function resolveOrganizationAccess(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	organizationId: Id<"organizations">,
): Promise<ResolvedAccess | null> {
	const [user, organization, membership] = await Promise.all([
		ctx.db.get("users", userId),
		ctx.db.get("organizations", organizationId),
		organizationMembership(ctx, userId, organizationId),
	]);
	if (!user || !organization || !membership) return null;
	return resolveRoleAccess(ctx, user, membership.roleIds);
}

/**
 * Project access needs both a project link and an organization membership.
 * The link's pinned role wins; unpinned links inherit the membership roles.
 */
export async function resolveProjectAccess(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	projectId: Id<"projects">,
): Promise<ResolvedAccess | null> {
	const project = await ctx.db.get("projects", projectId);
	if (!project) return null;
	const [user, link, membership] = await Promise.all([
		ctx.db.get("users", userId),
		ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) =>
				q.eq("projectId", projectId).eq("userId", userId),
			)
			.unique(),
		organizationMembership(ctx, userId, project.organizationId),
	]);
	if (!user || !link || !membership) return null;
	return resolveRoleAccess(
		ctx,
		user,
		link.roleId ? [link.roleId] : membership.roleIds,
		projectId,
	);
}

async function resolveRoleAccess(
	ctx: QueryCtx | MutationCtx,
	user: Doc<"users">,
	roleIds: readonly Id<"roles">[],
 	projectId?: Id<"projects">,
): Promise<ResolvedAccess | null> {
	if (!roleIds.length) return null;
	const permissions = new Set<Capability>();
	let role: string | null = null;
	let resolvedRoleId: Id<"roles"> | null = null;
	for (const roleId of roleIds) {
		const assignedRole = await ctx.db.get("roles", roleId);
		if (!assignedRole) return null;
		// Built-in roles have no projectId and apply anywhere; custom roles
		// only grant access inside the project that owns them.
		if (
			assignedRole.projectId !== undefined &&
			assignedRole.projectId !== projectId
		)
			return null;
		if (
			role === null ||
			(roleRank[assignedRole.name as Role] ?? 0) >
				(roleRank[role as Role] ?? 0)
		) {
			role = assignedRole.name;
			resolvedRoleId = assignedRole._id;
		}
		for (const permissionId of assignedRole.permissionIds) {
			const permission = await ctx.db.get("permissions", permissionId);
			if (!permission) return null;
			permissions.add(permission.key);
		}
	}

	return role && resolvedRoleId
		? { user, roleId: resolvedRoleId, role, permissions: [...permissions] }
		: null;
}

/**
 * Grant ceiling: nobody hands out, or takes away from someone else, access
 * they do not hold themselves. Prevents a team-only role from minting admins.
 */
export function exceedsGrants(
	candidate: readonly Capability[],
	held: readonly Capability[],
) {
	return candidate.some((permission) => !held.includes(permission));
}

export async function rolePermissions(
	ctx: QueryCtx | MutationCtx,
	role: Doc<"roles">,
): Promise<Capability[]> {
	const permissions = await Promise.all(
		role.permissionIds.map((permissionId) => ctx.db.get("permissions", permissionId)),
	);
	return permissions.flatMap((permission) => (permission ? [permission.key] : []));
}
