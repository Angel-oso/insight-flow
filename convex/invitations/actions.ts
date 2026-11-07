import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { enforceRateLimit } from "../rateLimits";

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
		// Session-checked: a revoked session can't keep inviting.
		const creatorId: Id<"users"> | null = await ctx.runQuery(internal.users.queries.activeUserId, {});
		if (!creatorId) throw new ConvexError("Sign in to invite project members.");
		await enforceRateLimit(ctx, "createInvitation", creatorId);
		return ctx.runMutation(internal.invitations.mutations.create, {
			...args,
			creatorId,
			token: crypto.randomUUID().replaceAll("-", ""),
			expiresAt: Date.now() + args.expiresInHours * 60 * 60 * 1000,
		});
	},
});

/**
 * Emails a one-time invitation link to `email`. The link is not returned:
 * only the recipient's inbox gets it. The response is the same whether or
 * not the address has an account (nothing looks it up). Validation and the
 * per-inviter, per-project and per-recipient limits run in the mutation.
 */
export const sendByEmail = action({
	args: {
		projectSlug: v.string(),
		roleId: v.id("roles"),
		expiresInHours: expiryHours,
		email: v.string(),
	},
	returns: v.object({ email: v.string(), expiresAt: v.number() }),
	handler: async (ctx, args): Promise<{ email: string; expiresAt: number }> => {
		// Session-checked: a revoked session can't keep inviting.
		const creatorId: Id<"users"> | null = await ctx.runQuery(internal.users.queries.activeUserId, {});
		if (!creatorId) throw new ConvexError("Sign in to invite project members.");
		if (args.email.length > 320) throw new ConvexError("Enter a valid email address.");
		return ctx.runMutation(internal.invitations.mutations.createForEmail, {
			...args,
			creatorId,
			token: crypto.randomUUID().replaceAll("-", ""),
			expiresAt: Date.now() + args.expiresInHours * 60 * 60 * 1000,
		});
	},
});
