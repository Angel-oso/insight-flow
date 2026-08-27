import "server-only";

import type { Role } from "./permissions";

export type CurrentUser = {
	readonly id: string;
	readonly name: string;
	readonly projectRoles: Readonly<Record<string, Role>>;
};

const demoAdministrator: CurrentUser = {
	id: "alex-johnson",
	name: "Alex Johnson",
	projectRoles: {
		"client-portal": "admin",
		"mobile-app": "admin",
		academy: "admin",
	},
};

/**
 * Server-side seam for the authenticated workspace member.
 *
 * The MVP has no identity provider yet, so it returns the documented demo
 * administrator. Replace this implementation with the verified session lookup
 * when authentication is connected; UI surfaces must consume this boundary
 * rather than defining their own role.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
	return demoAdministrator;
}

export async function getCurrentProjectRole(
	projectSlug: string,
): Promise<Role | null> {
	const user = await getCurrentUser();
	return user.projectRoles[projectSlug] ?? null;
}
