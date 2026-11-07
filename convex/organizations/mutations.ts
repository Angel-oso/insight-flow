import { ConvexError, v } from "convex/values";
import { resolveOrganizationAccess } from "../access/roles";
import { logAudit } from "../audit/log";
import { mutation } from "../_generated/server";
import { requireOrganization } from "./access";

export const rename = mutation({
	args: { organizationId: v.id("organizations"), name: v.string() },
	returns: v.null(),
	handler: async (ctx, { organizationId, name: rawName }) => {
		const { userId, organization } = await requireOrganization(ctx, organizationId, true);
		const name = rawName.trim().replace(/\s+/g, " ");
		if (!name || name.length > 80) throw new ConvexError("Give the organization a name between 1 and 80 characters.");
		if (name === organization.name) return null;
		await ctx.db.patch("organizations", organizationId, { name });
		await logAudit(ctx, {
			organizationId,
			actorId: userId,
			action: "organization.renamed",
			summary: `Renamed the organization from "${organization.name}" to "${name}"`,
		});
		return null;
	},
});

export const transferOwnership = mutation({
	args: { organizationId: v.id("organizations"), userId: v.id("users") },
	returns: v.null(),
	handler: async (ctx, { organizationId, userId: targetId }) => {
		const { userId, organization } = await requireOrganization(ctx, organizationId, true);
		if (organization.ownerId !== userId) throw new ConvexError("Only the current owner can transfer ownership.");
		if (targetId === userId) throw new ConvexError("You already own this organization.");
		const target = await resolveOrganizationAccess(ctx, targetId, organizationId);
		if (!target?.permissions.includes("organization.manage")) throw new ConvexError("Choose an organization administrator as the new owner.");
		await ctx.db.patch("organizations", organizationId, { ownerId: targetId });
		await logAudit(ctx, {
			organizationId,
			actorId: userId,
			action: "organization.ownership_transferred",
			targetUserId: targetId,
			summary: `Transferred ownership to ${target.user.name ?? "a team member"}`,
		});
		return null;
	},
});
