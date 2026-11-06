import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { ALERT_DEDUPE_MS } from "./critical";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Delivered/bounced/cancelled emails keep their bodies this long. */
export const FINALIZED_EMAIL_RETENTION_MS = 7 * DAY_MS;
/** Emails that never finalized (no webhook event) are dropped after this. */
export const ABANDONED_EMAIL_RETENTION_MS = 14 * DAY_MS;
/** Alert ledger rows only matter for dedupe; keep a margin past the window. */
const ALERT_LOG_RETENTION_MS = Math.max(DAY_MS, ALERT_DEDUPE_MS * 2);
const PURGE_BATCH = 500;

/**
 * Daily cron (convex/crons.ts). Stored emails hold feedback content and
 * recipient addresses, so they are deleted through the Resend component's
 * own cleanup; the alert ledger is trimmed in bounded batches.
 */
export const purge = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		await ctx.scheduler.runAfter(0, components.resend.lib.cleanupOldEmails, {
			olderThan: FINALIZED_EMAIL_RETENTION_MS,
		});
		await ctx.scheduler.runAfter(0, components.resend.lib.cleanupAbandonedEmails, {
			olderThan: ABANDONED_EMAIL_RETENTION_MS,
		});
		await ctx.scheduler.runAfter(0, internal.notifications.retention.purgeAlertLog, {});
		return null;
	},
});

export const purgeAlertLog = internalMutation({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		const cutoff = Date.now() - ALERT_LOG_RETENTION_MS;
		const rows = await ctx.db
			.query("criticalAlertLog")
			.withIndex("by_at", (q) => q.lt("at", cutoff))
			.take(PURGE_BATCH);
		// Summaries run minutes after folding, so day-old rows are settled.
		for (const row of rows) await ctx.db.delete("criticalAlertLog", row._id);
		if (rows.length === PURGE_BATCH) {
			await ctx.scheduler.runAfter(0, internal.notifications.retention.purgeAlertLog, {});
		}
		return rows.length;
	},
});
