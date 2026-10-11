import type { Capability, Role } from "../../lib/auth/permissions";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const roleRank: Record<Role, number> = {
	admin: 3,
	manager: 2,
	member: 1,
};

/** Resolve one organization membership; legacy user fields remain during migration. */
export async function resolveOrganizationAccess(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	organizationId: Id<"organizations">,
): Promise<{
	user: Doc<"users">;
	roleId: Id<"roles">;
	role: string;
	permissions: Capability[];
} | null> {
	const [user, organization, membership] = await Promise.all([
		ctx.db.get("users", userId),
		ctx.db.get("organizations", organizationId),
		ctx.db
			.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) =>
				q.eq("organizationId", organizationId).eq("userId", userId),
			)
			.unique(),
	]);
	if (!user || !organization) return null;
	const roleIds = membership?.roleIds ??
		(user.organizationId === organizationId ? user.roleIds ?? [] : []);
	return resolveRoleAccess(ctx, user, roleIds);
}

/** Resolve role grants for one project membership, falling back for legacy links. */
export async function resolveProjectAccess(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	projectId: Id<"projects">,
): Promise<{
	user: Doc<"users">;
	roleId: Id<"roles">;
	role: string;
	permissions: Capability[];
} | null> {
	const project = await ctx.db.get("projects", projectId);
	if (!project) return null;
	const link = await ctx.db
		.query("projectMembers")
		.withIndex("by_projectId_userId", (q) =>
			q.eq("projectId", projectId).eq("userId", userId),
		)
		.unique();
	if (!link) return null;
	const organizationAccess = await resolveOrganizationAccess(
		ctx,
		userId,
		project.organizationId,
	);
	if (!organizationAccess) return null;
	return resolveRoleAccess(
		ctx,
		organizationAccess.user,
		link.roleId ? [link.roleId] : organizationAccess.user.roleIds ?? [],
		projectId,
	);
}

async function resolveRoleAccess(
	ctx: QueryCtx | MutationCtx,
	user: Doc<"users">,
	roleIds: readonly Id<"roles">[],
 	projectId?: Id<"projects">,
): Promise<{
	user: Doc<"users">;
	roleId: Id<"roles">;
	role: string;
	permissions: Capability[];
} | null> {
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
