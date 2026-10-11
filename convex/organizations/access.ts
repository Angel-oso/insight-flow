import { ConvexError } from "convex/values";
import { resolveOrganizationAccess } from "../access/roles";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUserId } from "../feedback/access";

export async function requireOrganization(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">, adminOnly = false) {
	const userId = await requireUserId(ctx);
	const access = await resolveOrganizationAccess(ctx, userId, organizationId);
	if (!access) throw new ConvexError("Organization access denied.");
	const isAdmin = access.permissions.includes("organization.manage");
	if (adminOnly && !isAdmin) throw new ConvexError("Only organization administrators can change these settings.");
	const organization = (await ctx.db.get("organizations", organizationId))!;
	return { userId, access, organization, isAdmin };
}
