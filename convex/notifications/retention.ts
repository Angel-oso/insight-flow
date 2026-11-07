import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { ALERT_DEDUPE_MS } from "./critical";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Alert ledger rows only matter for dedupe; keep a margin past the window. */
const ALERT_LOG_RETENTION_MS = Math.max(DAY_MS, ALERT_DEDUPE_MS * 2);
const PURGE_BATCH = 500;

/**
 * Daily cron (convex/crons.ts). Trims the alert ledger in bounded batches.
 * Emails are not stored: Brevo sends run as scheduled jobs whose records
 * Convex deletes on its own after a few days.
 */
export const purge = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
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
