import { ConvexError, v } from "convex/values";
import { resolveOrganizationAccess } from "../access/roles";
import { mutation } from "../_generated/server";
import { requireOrganization } from "./access";

export const rename = mutation({
	args: { organizationId: v.id("organizations"), name: v.string() },
	handler: async (ctx, { organizationId, name: rawName }) => {
		await requireOrganization(ctx, organizationId, true);
		const name = rawName.trim().replace(/\s+/g, " ");
		if (!name || name.length > 80) throw new ConvexError("Give the organization a name between 1 and 80 characters.");
		await ctx.db.patch("organizations", organizationId, { name });
		return null;
	},
});

export const transferOwnership = mutation({
	args: { organizationId: v.id("organizations"), userId: v.id("users") },
	handler: async (ctx, { organizationId, userId: targetId }) => {
		const { userId, organization } = await requireOrganization(ctx, organizationId, true);
		if (organization.ownerId !== userId) throw new ConvexError("Only the current owner can transfer ownership.");
		const target = await resolveOrganizationAccess(ctx, targetId, organizationId);
		if (!target?.permissions.includes("organization.manage")) throw new ConvexError("Choose an organization administrator as the new owner.");
		await ctx.db.patch("organizations", organizationId, { ownerId: targetId });
		return null;
	},
});
