import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { getSessionUserId } from "../feedback/access";

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
			hasPassword: v.boolean(),
			// New address waiting for its confirmation code, if any.
			pendingEmail: v.union(v.string(), v.null()),
		}),
		v.null(),
	),
	handler: async (ctx) => {
		const userId = await getSessionUserId(ctx);
		if (!userId) return null;
		const user = await ctx.db.get("users", userId);
		if (!user) return null;
		const passwordAccount = await ctx.db
			.query("authAccounts")
			.withIndex("userIdAndProvider", (q) =>
				q.eq("userId", user._id).eq("provider", "password"),
			)
			.first();
		const pendingChange = await ctx.db
			.query("emailChangeRequests")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.first();
		return {
			id: user._id,
			name: user.name ?? null,
			email: user.email ?? null,
			image: user.image ?? null,
			hasPassword: Boolean(passwordAccount),
			pendingEmail: pendingChange?.email ?? null,
		};
	},
});

/**
 * The caller's user id for actions (which have no database): null when
 * signed out or when the token's session was revoked. Actions pass their
 * auth to runQuery, so this sees the same identity.
 */
export const activeUserId = internalQuery({
	args: {},
	returns: v.union(v.id("users"), v.null()),
	handler: async (ctx) => await getSessionUserId(ctx),
});
