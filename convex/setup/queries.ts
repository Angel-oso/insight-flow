import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Access gate for the authenticated app shell. The client renders the
 * workspace only when `hasMembership` is true; otherwise it shows a
 * no-workspace notice. Every decision here is server-side so the client
 * cannot talk itself into access.
 */
export const status = query({
	args: {},
	returns: v.object({
		authenticated: v.boolean(),
		hasMembership: v.boolean(),
	}),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return { authenticated: false, hasMembership: false };
		const membership = await ctx.db
			.query("memberships")
			.withIndex("by_userId", (q) => q.eq("userId", userId as Id<"users">))
			.first();
		return {
			authenticated: true,
			hasMembership: membership !== null,
		};
	},
});
