import { vOnEmailEventArgs } from "@convex-dev/resend";
import { v } from "convex/values";
import { internalMutation, type QueryCtx } from "../_generated/server";

/** Plain lowercase address from "a@b.c" or "Name <a@b.c>". */
export function normalizeAddress(value: string) {
	const match = /<([^>]+)>/.exec(value);
	return (match ? match[1] : value).trim().toLowerCase();
}

/** Whether notification emails to `email` are suppressed (bounce/complaint). */
export async function isSuppressed(ctx: QueryCtx, email: string) {
	const row = await ctx.db
		.query("emailSuppressions")
		.withIndex("by_email", (q) => q.eq("email", normalizeAddress(email)))
		.first();
	return row !== null;
}

/**
 * Resend webhook callback (registered in convex/email/send.ts, delivered via
 * /resend-webhook). Hard bounces and spam complaints suppress the address
 * for notification emails; transient bounces are ignored. Auth codes never
 * check this table, so a user can still sign in and fix their address.
 */
export const onEmailEvent = internalMutation({
	args: vOnEmailEventArgs,
	returns: v.null(),
	handler: async (ctx, { event }) => {
		let reason: "bounced" | "complained";
		let detail: string | undefined;
		if (event.type === "email.complained") {
			reason = "complained";
		} else if (event.type === "email.bounced") {
			if (event.data.bounce.type.toLowerCase() === "transient") return null;
			reason = "bounced";
			detail = `${event.data.bounce.type}/${event.data.bounce.subType}`.slice(0, 200);
		} else {
			return null;
		}
		const recipients = (Array.isArray(event.data.to) ? event.data.to : [event.data.to]).slice(0, 50);
		for (const raw of recipients) {
			const email = normalizeAddress(raw);
			if (!email || email.length > 254) continue;
			const existing = await ctx.db
				.query("emailSuppressions")
				.withIndex("by_email", (q) => q.eq("email", email))
				.first();
			if (existing) continue;
			await ctx.db.insert("emailSuppressions", {
				email,
				reason,
				...(detail ? { detail } : {}),
				at: Date.now(),
			});
			console.warn(`[email] Suppressed notifications to ${email} (${reason}).`);
		}
		return null;
	},
});
