import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { deliverEmail } from "../email/send";
import { RESTORE_WINDOW_MS } from "../projects/deletion";
import {
	alertEmail,
	FUNCTION_THROTTLE_MS,
	groupFailures,
	hasAlerts,
	nextWatermark,
	planAlert,
	scrubError,
	stuckKey,
	throttleKey,
	type FailedJob,
	type StuckDeletion,
	type Throttle,
} from "./detect";

/**
 * Backend failure alerting. Sentry only sees the Next.js app; a scheduled
 * Convex job that throws (purges, digest, critical alerts, webhook delivery,
 * retention crons, submitter erasure) otherwise fails silently.
 *
 * Every 15 minutes (convex/crons.ts) `run` reads `_scheduled_functions`
 * newest first, picks jobs in state `failed` that completed after the stored
 * watermark, adds deletions still present a day past the restore window, and
 * sends ONE email to OPS_ALERT_EMAIL. See convex/monitoring/detect.ts for the
 * grouping and throttling rules.
 *
 * Scan bounds: only jobs created at most SCHEDULE_SLACK_MS before the
 * watermark are read (Convex keeps finished jobs for about a week anyway),
 * capped at SCAN_LIMIT documents. Jobs scheduled further ahead are the
 * 7-day purges; if one of those fails, the stuck-deletion check reports it.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WATERMARK_KEY = "failedScheduledFunctions";
const SCAN_LIMIT = 2000;
const SCHEDULE_SLACK_MS = DAY_MS;
/** First run (or a fresh deployment) looks back this far. */
const FIRST_RUN_LOOKBACK_MS = DAY_MS;
/** A purge should finish well within a day of its scheduled time. */
export const STUCK_AFTER_MS = RESTORE_WINDOW_MS + DAY_MS;
const STUCK_LIMIT = 20;
const LAPSED_LIMIT = 100;
const THROTTLE_RETENTION_MS = 7 * DAY_MS;
const THROTTLE_CLEANUP_BATCH = 50;

function opsAlertEmail() {
	const value = typeof process === "undefined" ? undefined : process.env.OPS_ALERT_EMAIL;
	return value?.trim() || undefined;
}

function deploymentName() {
	const url = typeof process === "undefined" ? undefined : process.env.CONVEX_CLOUD_URL;
	return url?.trim() || "unknown deployment";
}

/** Failed jobs created since `createdAfter`, newest first, at most SCAN_LIMIT reads. */
async function scanFailedJobs(ctx: QueryCtx, createdAfter: number) {
	const jobs: FailedJob[] = [];
	let read = 0;
	let truncated = false;
	for await (const job of ctx.db.system.query("_scheduled_functions").order("desc")) {
		if (job._creationTime < createdAfter) break;
		if (++read > SCAN_LIMIT) {
			truncated = true;
			break;
		}
		if (job.state.kind !== "failed") continue;
		jobs.push({
			id: job._id,
			name: job.name,
			completedTime: job.completedTime ?? job.scheduledTime,
			// convex-test records failures without the error text.
			error: (job.state as { error?: string }).error ?? "",
		});
	}
	return { jobs, truncated };
}

async function purgeState(ctx: QueryCtx, jobId: Doc<"organizations">["purgeJobId"]) {
	if (!jobId) return undefined;
	const job = await ctx.db.system.get("_scheduled_functions", jobId);
	return job?.state.kind;
}

/** Projects and organizations still present a day after their purge was due. */
async function findStuckDeletions(ctx: QueryCtx, now: number): Promise<StuckDeletion[]> {
	const cutoff = now - STUCK_AFTER_MS;
	const stuck: StuckDeletion[] = [];
	const organizations = await ctx.db
		.query("organizations")
		.withIndex("by_deletionRequestedAt", (q) => q.gte("deletionRequestedAt", 0).lt("deletionRequestedAt", cutoff))
		.take(STUCK_LIMIT);
	for (const organization of organizations) {
		stuck.push({
			kind: "organization",
			id: organization._id,
			requestedAt: organization.deletionRequestedAt!,
			purgeState: await purgeState(ctx, organization.purgeJobId),
		});
	}
	const projects = await ctx.db
		.query("projects")
		.withIndex("by_deletionRequestedAt", (q) => q.gte("deletionRequestedAt", 0).lt("deletionRequestedAt", cutoff))
		.take(STUCK_LIMIT);
	for (const project of projects) {
		stuck.push({
			kind: "project",
			id: project._id,
			requestedAt: project.deletionRequestedAt!,
			purgeState: await purgeState(ctx, project.deletion?.purgeJobId),
		});
	}
	return stuck;
}

const failureValidator = v.object({
	id: v.string(),
	name: v.string(),
	completedTime: v.number(),
	error: v.string(),
});
const stuckValidator = v.object({
	kind: v.union(v.literal("project"), v.literal("organization")),
	id: v.string(),
	requestedAt: v.number(),
	purgeState: v.optional(v.string()),
});

export const run = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const to = opsAlertEmail();
		if (!to) {
			console.error("[monitoring] OPS_ALERT_EMAIL is not set; backend failure alerts are off.");
			return null;
		}
		const now = Date.now();
		const state = await ctx.db
			.query("monitoringState")
			.withIndex("by_key", (q) => q.eq("key", WATERMARK_KEY))
			.unique();
		const watermark = state?.watermark ?? now - FIRST_RUN_LOOKBACK_MS;

		const { jobs, truncated } = await scanFailedJobs(ctx, watermark - SCHEDULE_SLACK_MS);
		if (truncated) console.warn(`[monitoring] scan stopped at ${SCAN_LIMIT} scheduled jobs.`);
		const groups = groupFailures(jobs, watermark);
		const stuck = await findStuckDeletions(ctx, now);

		const keys = [...groups.map((group) => throttleKey(group.name)), ...stuck.map(stuckKey)];
		const rows = new Map<string, Doc<"monitoringThrottle">>();
		for (const key of keys) {
			const row = await ctx.db
				.query("monitoringThrottle")
				.withIndex("by_key", (q) => q.eq("key", key))
				.unique();
			if (row) rows.set(key, row);
		}
		const lapsed = new Map<string, number>();
		const pending = await ctx.db
			.query("monitoringThrottle")
			.withIndex("by_suppressed", (q) => q.gt("suppressed", 0))
			.take(LAPSED_LIMIT);
		for (const row of pending) {
			if (!row.key.startsWith("fn:") || now - row.lastAlertAt < FUNCTION_THROTTLE_MS) continue;
			rows.set(row.key, row);
			lapsed.set(row.key.slice(3), row.suppressed);
		}

		const throttles = new Map<string, Throttle>(
			[...rows].map(([key, row]) => [key, { lastAlertAt: row.lastAlertAt, suppressed: row.suppressed }]),
		);
		const plan = planAlert({ groups, stuck, throttles, lapsed, now });

		for (const [key, update] of plan.throttleUpdates) {
			const row = rows.get(key);
			if (row) await ctx.db.patch("monitoringThrottle", row._id, update);
			else await ctx.db.insert("monitoringThrottle", { key, ...update });
		}
		const newWatermark = nextWatermark(jobs, watermark);
		if (state) {
			if (newWatermark !== state.watermark) await ctx.db.patch("monitoringState", state._id, { watermark: newWatermark });
		} else {
			await ctx.db.insert("monitoringState", { key: WATERMARK_KEY, watermark: newWatermark });
		}

		// Old throttle rows with nothing pending only matter for an hour (a day
		// for stuck deletions); drop them in a small batch.
		const stale = await ctx.db
			.query("monitoringThrottle")
			.withIndex("by_lastAlertAt", (q) => q.lt("lastAlertAt", now - THROTTLE_RETENTION_MS))
			.take(THROTTLE_CLEANUP_BATCH);
		for (const row of stale) {
			if (row.suppressed === 0 && !plan.throttleUpdates.has(row.key)) await ctx.db.delete("monitoringThrottle", row._id);
		}

		if (hasAlerts(plan)) {
			await deliverEmail(ctx, {
				to,
				...alertEmail(plan, deploymentName()),
			});
		}
		return null;
	},
});

/**
 * Manual check: `npx convex run monitoring/alerts:recentFailures` (optionally
 * `'{"limit": 50}'`). Lists the newest failed scheduled jobs among the last
 * SCAN_LIMIT jobs plus stuck deletions, with error text scrubbed of emails.
 */
export const recentFailures = internalQuery({
	args: {
		limit: v.optional(v.number()),
		// Defaults to the wall clock; this is a one-shot CLI query, not a
		// subscription, so a stale result is not a concern.
		now: v.optional(v.number()),
	},
	returns: v.object({
		failures: v.array(failureValidator),
		stuckDeletions: v.array(stuckValidator),
		scanTruncated: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), 200);
		const now = args.now ?? Date.now();
		const { jobs, truncated } = await scanFailedJobs(ctx, 0);
		return {
			failures: jobs.slice(0, limit).map((job) => ({ ...job, error: scrubError(job.error) })),
			stuckDeletions: await findStuckDeletions(ctx, now),
			scanTruncated: truncated,
		};
	},
});
