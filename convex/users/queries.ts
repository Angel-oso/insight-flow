import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * The signed-in caller's own profile. Returns null for anonymous callers
 * and for sessions whose user row no longer exists. Only the caller's own
 * row is ever returned — this is the single place the client learns "who
 * am I", so member PII never leaks through other queries.
 */
export const current = query({
	args: {},
	returns: v.union(
		v.object({
			id: v.id("users"),
			name: v.union(v.string(), v.null()),
			email: v.union(v.string(), v.null()),
			image: v.union(v.string(), v.null()),
		}),
		v.null(),
	),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return null;
		const user = await ctx.db.get("users", userId as Id<"users">);
		if (!user) return null;
		return {
			id: user._id,
			name: user.name ?? null,
			email: user.email ?? null,
			image: user.image ?? null,
		};
	},
});
