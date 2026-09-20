import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { resolveUserAccess } from "../access/roles";
import { requireCapability } from "../feedback/access";
import { ensureTaxonomies, getTaxonomies, taxonomiesValidator } from "./lib";
import schema from "../schema";

export const list = query({
	args: {},
	returns: v.array(schema.doc("taxonomies")),
	handler: async (ctx) => {
		// Display metadata is shared, but it is still workspace data:
		// anonymous callers get nothing.
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Sign in to access this workspace.");
		const access = await resolveUserAccess(ctx, userId);
		if (!access?.user.organizationId)
			throw new ConvexError("Workspace access denied.");
		requireCapability(access.permissions, "project.view");
		return await ctx.db.query("taxonomies").withIndex("by_key").collect();
	},
});

// Internal backfill helper for databases seeded before taxonomies existed.
export const ensureDefaults = internalMutation({
	args: {},
	returns: taxonomiesValidator,
	handler: async (ctx) => {
		await ensureTaxonomies(ctx);
		return await getTaxonomies(ctx);
	},
});
