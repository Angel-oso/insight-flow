import { v } from "convex/values";
import { internal } from "../_generated/api";
import { isProjectDeleted } from "../access/roles";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type QueryCtx } from "../_generated/server";
import { appUrl } from "../email/config";
import { deliverEmail } from "../email/send";
import { weeklyDigestEmail, type DigestItem, type DigestStats } from "../email/templates";
import { projectBacklog, windowCounts } from "../feedback/aggregates";
import { getFinalStatuses, getTaxonomies } from "../taxonomies/lib";
import { unsubscribeFor } from "./preferences";
import { triageRecipients } from "./recipients";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DIGEST_WINDOW_MS = 7 * DAY_MS;
/** Projects read per scheduling transaction. */
const PROJECT_BATCH = 50;
/** Cap for the one count that has no aggregate (critical received). */
const CRITICAL_SCAN_LIMIT = 500;
const ATTENTION_ITEMS = 5;

/**
 * Weekly cron entry point (see convex/crons.ts). Pages through projects in
 * bounded batches, schedules one digest per opted-in project and
 * reschedules itself for the next page. `windowEnd` is fixed on the first
 * page so every project covers the same 7 days.
 */
export const run = internalMutation({
	args: {
		cursor: v.union(v.string(), v.null()),
		windowEnd: v.optional(v.number()),
	},
	returns: v.object({ scheduled: v.number(), done: v.boolean() }),
	handler: async (ctx, { cursor, windowEnd }) => {
		const end = windowEnd ?? Date.now();
		const page = await ctx.db
			.query("projects")
			.paginate({ numItems: PROJECT_BATCH, cursor });
		let scheduled = 0;
		for (const project of page.page) {
			if (!project.weeklyDigest || project.status === "Archived" || (await isProjectDeleted(ctx, project))) continue;
			await ctx.scheduler.runAfter(0, internal.notifications.digest.sendProjectDigest, {
				projectId: project._id,
				windowEnd: end,
			});
			scheduled += 1;
		}
		if (!page.isDone) {
			await ctx.scheduler.runAfter(0, internal.notifications.digest.run, {
				cursor: page.continueCursor,
				windowEnd: end,
			});
		}
		return { scheduled, done: page.isDone };
	},
});

async function digestFor(ctx: QueryCtx, project: Doc<"projects">, windowEnd: number) {
	const windowStart = windowEnd - DIGEST_WINDOW_MS;
	const taxonomies = await getTaxonomies(ctx, project.organizationId);
	const finals = await getFinalStatuses(ctx, project.organizationId);
	const topRank = Math.max(0, ...taxonomies.priorities.map((entry) => entry.rank));
	const rankOf = new Map(taxonomies.priorities.map((entry) => [entry.value, entry.rank]));
	const topPriorities = taxonomies.priorities
		.filter((entry) => entry.rank === topRank)
		.map((entry) => entry.value);

	const [windows, backlog] = await Promise.all([
		windowCounts(ctx, project._id, [{ start: windowStart, end: windowEnd }]),
		projectBacklog(ctx, project._id, taxonomies, finals),
	]);

	let critical = 0;
	let capped = false;
	for (const priority of topPriorities) {
		const rows = await ctx.db
			.query("feedback")
			.withIndex("by_projectId_priority_receivedAt", (q) =>
				q
					.eq("projectId", project._id)
					.eq("priority", priority)
					.gte("receivedAt", windowStart)
					.lt("receivedAt", windowEnd),
			)
			.take(CRITICAL_SCAN_LIMIT + 1);
		critical += Math.min(rows.length, CRITICAL_SCAN_LIMIT);
		if (rows.length > CRITICAL_SCAN_LIMIT) capped = true;
	}

	// Needs attention: open items in the two highest priority ranks that
	// have gone longest without an update. Each lane reads at most N rows.
	const attentionRanks = [...new Set(taxonomies.priorities.map((entry) => entry.rank))]
		.sort((a, b) => b - a)
		.slice(0, 2);
	const attentionPriorities = taxonomies.priorities.filter((entry) =>
		attentionRanks.includes(entry.rank),
	);
	const openStatuses = taxonomies.statuses.filter((entry) => !finals.has(entry.value));
	const candidates: Doc<"feedback">[] = [];
	for (const status of openStatuses) {
		for (const priority of attentionPriorities) {
			candidates.push(
				...(await ctx.db
					.query("feedback")
					.withIndex("by_projectId_status_priority_updatedAt", (q) =>
						q
							.eq("projectId", project._id)
							.eq("status", status.value)
							.eq("priority", priority.value),
					)
					.order("asc")
					.take(ATTENTION_ITEMS)),
			);
		}
	}
	const items: DigestItem[] = candidates
		.sort(
			(a, b) =>
				(rankOf.get(b.priority) ?? 0) - (rankOf.get(a.priority) ?? 0) ||
				a.updatedAt - b.updatedAt,
		)
		.slice(0, ATTENTION_ITEMS)
		.map((item) => ({
			title: item.title,
			priority: item.priority,
			status: item.status,
			ageDays: Math.max(0, Math.floor((windowEnd - item.receivedAt) / DAY_MS)),
			url: appUrl(
				`/projects/${encodeURIComponent(project.slug)}/feedback?feedback=${item._id}`,
			),
		}));

	const stats: DigestStats = {
		received: windows.received[0] ?? 0,
		resolved: windows.completed[0] ?? 0,
		open: backlog.open,
		critical,
		capped,
	};
	return { stats, items };
}

const statsValidator = v.object({
	received: v.number(),
	resolved: v.number(),
	open: v.number(),
	critical: v.number(),
	capped: v.boolean(),
});

/** Builds and sends one project's digest to its triagers. */
export const sendProjectDigest = internalMutation({
	args: { projectId: v.id("projects"), windowEnd: v.number() },
	returns: v.union(
		v.null(),
		v.object({ recipients: v.array(v.string()), stats: statsValidator }),
	),
	handler: async (ctx, { projectId, windowEnd }) => {
		const project = await ctx.db.get("projects", projectId);
		if (!project || !project.weeklyDigest || project.status === "Archived" || (await isProjectDeleted(ctx, project))) return null;
		const recipients = await triageRecipients(ctx, project, "digest");
		if (recipients.length === 0) return { recipients: [], stats: emptyStats() };
		const { stats, items } = await digestFor(ctx, project, windowEnd);
		// A quiet project with nothing open gets no email.
		if (stats.received === 0 && stats.resolved === 0 && stats.open === 0) {
			return { recipients: [], stats };
		}
		const settingsUrl = appUrl(`/projects/${encodeURIComponent(project.slug)}/settings`);
		for (const recipient of recipients) {
			const unsubscribe = await unsubscribeFor(ctx, recipient.userId, project._id, "digest", settingsUrl);
			await deliverEmail(ctx, {
				to: recipient.email,
				...weeklyDigestEmail({
					projectName: project.name,
					stats,
					items,
					feedbackUrl: appUrl(`/projects/${encodeURIComponent(project.slug)}/feedback`),
					settingsUrl,
					unsubscribeUrl: unsubscribe.url,
				}),
				headers: unsubscribe.headers,
			});
		}
		return { recipients: recipients.map((recipient) => recipient.email), stats };
	},
});

function emptyStats(): DigestStats {
	return { received: 0, resolved: 0, open: 0, critical: 0, capped: false };
}
