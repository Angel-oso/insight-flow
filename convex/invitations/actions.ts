import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { action } from "../_generated/server";

const expiryHours = v.union(v.literal(1), v.literal(6), v.literal(24));

/** Creates an opaque, one-time project invitation link. */
export const create = action({
	args: {
		projectSlug: v.string(),
		roleId: v.id("roles"),
		expiresInHours: expiryHours,
	},
	returns: v.object({ token: v.string(), expiresAt: v.number() }),
	handler: async (ctx, args): Promise<{ token: string; expiresAt: number }> => {
		const creatorId = await getAuthUserId(ctx);
		if (!creatorId) throw new ConvexError("Sign in to invite project members.");
		return ctx.runMutation(internal.invitations.mutations.create, {
			...args,
			creatorId,
			token: crypto.randomUUID().replaceAll("-", ""),
			expiresAt: Date.now() + args.expiresInHours * 60 * 60 * 1000,
		});
	},
});
