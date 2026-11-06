import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { PROJECT_MEMBER_LIMIT } from "../feedback/access";
import { ORGANIZATION_MEMBER_LIMIT } from "../organizations/members";

/**
 * Member caps. Rosters, the overview, the inbox and member removal read at
 * most PROJECT_MEMBER_LIMIT project links / ORGANIZATION_MEMBER_LIMIT
 * organization memberships and refuse beyond that, so nothing may add a
 * member past either cap. Each check reads at most `limit` rows.
 */

export type FullScope = "project" | "organization";

/**
 * A function, not a constant: organizations/members imports this module
 * through invitations/mutations, so its limit is not initialized yet while
 * this module first evaluates.
 */
export function capMessage(scope: FullScope) {
	return scope === "project"
		? `This project has reached its limit of ${PROJECT_MEMBER_LIMIT} members. Remove someone before adding more people.`
		: `This organization has reached its limit of ${ORGANIZATION_MEMBER_LIMIT} members. Remove someone before adding more people.`;
}

export async function projectIsFull(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">) {
	const links = await ctx.db
		.query("projectMembers")
		.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId))
		.take(PROJECT_MEMBER_LIMIT);
	return links.length >= PROJECT_MEMBER_LIMIT;
}

export async function organizationIsFull(
	ctx: QueryCtx | MutationCtx,
	organizationId: Id<"organizations">,
) {
	const memberships = await ctx.db
		.query("organizationMembers")
		.withIndex("by_organizationId_userId", (q) => q.eq("organizationId", organizationId))
		.take(ORGANIZATION_MEMBER_LIMIT);
	return memberships.length >= ORGANIZATION_MEMBER_LIMIT;
}

/**
 * Which cap (if any) blocks adding someone to `project`. With `userId`,
 * scopes they already belong to are skipped (re-joining adds no row);
 * without it (creating an invitation) both caps are checked.
 */
export async function fullScopeFor(
	ctx: QueryCtx | MutationCtx,
	project: Doc<"projects">,
	userId?: Id<"users">,
): Promise<FullScope | null> {
	const [link, membership] = userId
		? await Promise.all([
				ctx.db
					.query("projectMembers")
					.withIndex("by_projectId_userId", (q) =>
						q.eq("projectId", project._id).eq("userId", userId),
					)
					.unique(),
				ctx.db
					.query("organizationMembers")
					.withIndex("by_organizationId_userId", (q) =>
						q.eq("organizationId", project.organizationId).eq("userId", userId),
					)
					.unique(),
			])
		: [null, null];
	if (!link && (await projectIsFull(ctx, project._id))) return "project";
	if (!membership && (await organizationIsFull(ctx, project.organizationId))) return "organization";
	return null;
}
