import type { Capability, Role } from "../../lib/auth/permissions";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const roleRank: Record<Role, number> = {
	admin: 3,
	manager: 2,
	member: 1,
};

/** Resolve persisted role grants for a user. Broken references deny access. */
export async function resolveUserAccess(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
): Promise<{
	user: Doc<"users">;
	role: Role;
	permissions: Capability[];
} | null> {
	const user = await ctx.db.get("users", userId);
	if (!user?.organizationId || !user.roleIds?.length) return null;
	const organization = await ctx.db.get("organizations", user.organizationId);
	if (!organization) return null;

	const permissions = new Set<Capability>();
	let role: Role | null = null;
	for (const roleId of user.roleIds) {
		const assignedRole = await ctx.db.get("roles", roleId);
		if (!assignedRole) return null;
		if (role === null || roleRank[assignedRole.name] > roleRank[role]) {
			role = assignedRole.name;
		}
		for (const permissionId of assignedRole.permissionIds) {
			const permission = await ctx.db.get("permissions", permissionId);
			if (!permission) return null;
			permissions.add(permission.key);
		}
	}

	return role ? { user, role, permissions: [...permissions] } : null;
}
