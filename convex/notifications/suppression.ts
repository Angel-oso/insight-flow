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

/** Brevo events that make an address undeliverable for notifications. */
const SUPPRESSING_EVENTS = new Map<string, "bounced" | "complained">([
	["hard_bounce", "bounced"],
	["invalid_email", "bounced"],
	["spam", "complained"],
]);

/**
 * Brevo webhook events (parsed and authenticated in
 * convex/notifications/webhooks.ts). Hard bounces, invalid addresses and
 * spam complaints suppress the address for notification emails; soft
 * bounces and other events are ignored. Auth codes never check this table,
 * so a user can still sign in and fix their address.
 */
export const onBrevoEvents = internalMutation({
	args: {
		events: v.array(
			v.object({ event: v.string(), email: v.string(), reason: v.optional(v.string()) }),
		),
	},
	returns: v.null(),
	handler: async (ctx, { events }) => {
		for (const item of events.slice(0, 50)) {
			const reason = SUPPRESSING_EVENTS.get(item.event);
			if (!reason) continue;
			const email = normalizeAddress(item.email);
			if (!email || email.length > 254) continue;
			const existing = await ctx.db
				.query("emailSuppressions")
				.withIndex("by_email", (q) => q.eq("email", email))
				.first();
			if (existing) continue;
			const detail = `${item.event}${item.reason ? `: ${item.reason}` : ""}`.slice(0, 200);
			await ctx.db.insert("emailSuppressions", { email, reason, detail, at: Date.now() });
			console.warn(`[email] Suppressed notifications to ${email} (${reason}).`);
		}
		return null;
	},
});
