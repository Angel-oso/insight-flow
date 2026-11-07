import { MINUTE } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "../_generated/server";
import { appUrl } from "../email/config";
import { deliverEmail } from "../email/send";
import { criticalAlertEmail, criticalSummaryEmail } from "../email/templates";
import { rateLimiter } from "../rateLimits";
import { getTaxonomies } from "../taxonomies/lib";
import { unsubscribeFor } from "./preferences";
import { triageRecipients } from "./recipients";

/** At most one alert per feedback item in this window (toggling priority). */
export const ALERT_DEDUPE_MS = 6 * 60 * MINUTE;
/** Alerts over the per-project limit wait this long, then go out as one summary. */
export const SUMMARY_DELAY_MS = 10 * MINUTE;
/** Folded alerts read per summary run; the rest wait for the next one. */
const SUMMARY_BATCH = 100;
/** Items listed by name in a summary email. */
const SUMMARY_LISTED = 10;

/** Whether `item` sits at the organization's top priority rank. */
async function isTopPriority(ctx: QueryCtx, project: Doc<"projects">, item: Doc<"feedback">) {
	const { priorities } = await getTaxonomies(ctx, project.organizationId);
	if (priorities.length === 0) return false;
	const top = Math.max(...priorities.map((entry) => entry.rank));
	return priorities.some((entry) => entry.value === item.priority && entry.rank === top);
}

function alertsOn(project: Doc<"projects"> | null): project is Doc<"projects"> {
	return !!project && project.criticalAlerts && project.status !== "Archived" && project.deletionRequestedAt === undefined;
}

async function alertTarget(ctx: QueryCtx, feedbackId: Id<"feedback">) {
	const item = await ctx.db.get("feedback", feedbackId);
	if (!item) return null;
	const project = await ctx.db.get("projects", item.projectId);
	if (!alertsOn(project)) return null;
	if (!(await isTopPriority(ctx, project, item))) return null;
	return { item, project };
}

/** An alert for this item was sent or folded within the dedupe window. */
async function recentlyAlerted(ctx: QueryCtx, feedbackId: Id<"feedback">, now: number) {
	const recent = await ctx.db
		.query("criticalAlertLog")
		.withIndex("by_feedbackId_at", (q) => q.eq("feedbackId", feedbackId).gte("at", now - ALERT_DEDUPE_MS))
		.first();
	return recent !== null;
}

function feedbackUrl(project: Doc<"projects">, feedbackId: Id<"feedback">) {
	return appUrl(`/projects/${encodeURIComponent(project.slug)}/feedback?feedback=${feedbackId}`);
}

function settingsUrl(project: Doc<"projects">) {
	return appUrl(`/projects/${encodeURIComponent(project.slug)}/settings`);
}

/**
 * Call after feedback is inserted or its priority changes (in the same
 * mutation, after the write). Schedules the alert only when the project has
 * critical alerts on, the item is at the top priority rank and it wasn't
 * alerted recently; the emails go out in a separate transaction.
 */
export async function scheduleCriticalAlert(ctx: MutationCtx, feedbackId: Id<"feedback">) {
	const target = await alertTarget(ctx, feedbackId);
	if (!target) return;
	if (await recentlyAlerted(ctx, feedbackId, Date.now())) return;
	await ctx.scheduler.runAfter(0, internal.notifications.critical.sendCriticalAlert, {
		feedbackId,
		priority: target.item.priority,
	});
}

/**
 * Emails every opted-in triager of the project. Returns the addresses
 * notified. Dedupes per item, and past the per-project limit folds the
 * alert into one delayed summary so a burst never floods inboxes.
 */
export const sendCriticalAlert = internalMutation({
	args: { feedbackId: v.id("feedback"), priority: v.string() },
	returns: v.array(v.string()),
	handler: async (ctx, { feedbackId, priority }) => {
		const target = await alertTarget(ctx, feedbackId);
		// Settings or priority may have changed since scheduling.
		if (!target || target.item.priority !== priority) return [];
		const { item, project } = target;
		const now = Date.now();
		if (await recentlyAlerted(ctx, feedbackId, now)) return [];

		const limit = await rateLimiter.limit(ctx, "criticalAlertProject", { key: project._id });
		if (!limit.ok) {
			const summaryPending = await ctx.db
				.query("criticalAlertLog")
				.withIndex("by_projectId_state_at", (q) => q.eq("projectId", project._id).eq("state", "folded"))
				.first();
			await ctx.db.insert("criticalAlertLog", { projectId: project._id, feedbackId, state: "folded", at: now });
			if (!summaryPending) {
				await ctx.scheduler.runAfter(SUMMARY_DELAY_MS, internal.notifications.critical.sendCriticalSummary, {
					projectId: project._id,
				});
			}
			console.warn(`[notifications] Critical alert for ${feedbackId} folded into the next summary for project ${project._id}.`);
			return [];
		}

		await ctx.db.insert("criticalAlertLog", { projectId: project._id, feedbackId, state: "sent", at: now });
		const recipients = await triageRecipients(ctx, project, "critical");
		for (const recipient of recipients) {
			const unsubscribe = await unsubscribeFor(ctx, recipient.userId, project._id, "critical", settingsUrl(project));
			await deliverEmail(ctx, {
				to: recipient.email,
				...criticalAlertEmail({
					projectName: project.name,
					title: item.title,
					description: item.description,
					category: item.category,
					priority: item.priority,
					senderName: item.sender?.name || null,
					feedbackUrl: feedbackUrl(project, item._id),
					settingsUrl: settingsUrl(project),
					unsubscribeUrl: unsubscribe.url,
				}),
				headers: unsubscribe.headers,
			});
		}
		return recipients.map((recipient) => recipient.email);
	},
});

/**
 * One email for the alerts folded during a burst. Always settles the folded
 * rows (even when alerts were turned off meanwhile) so the next burst can
 * schedule its own summary. Returns the addresses notified.
 */
export const sendCriticalSummary = internalMutation({
	args: { projectId: v.id("projects") },
	returns: v.array(v.string()),
	handler: async (ctx, { projectId }) => {
		const folded = await ctx.db
			.query("criticalAlertLog")
			.withIndex("by_projectId_state_at", (q) => q.eq("projectId", projectId).eq("state", "folded"))
			.take(SUMMARY_BATCH + 1);
		const batch = folded.slice(0, SUMMARY_BATCH);
		for (const row of batch) await ctx.db.patch("criticalAlertLog", row._id, { state: "summarized" });
		if (folded.length > SUMMARY_BATCH) {
			await ctx.scheduler.runAfter(SUMMARY_DELAY_MS, internal.notifications.critical.sendCriticalSummary, { projectId });
		}

		const project = await ctx.db.get("projects", projectId);
		if (!alertsOn(project)) return [];
		// Only items that still exist and are still at the top priority.
		const items: Doc<"feedback">[] = [];
		const seen = new Set<Id<"feedback">>();
		for (const row of batch) {
			if (seen.has(row.feedbackId)) continue;
			seen.add(row.feedbackId);
			const item = await ctx.db.get("feedback", row.feedbackId);
			if (item && item.projectId === projectId && (await isTopPriority(ctx, project, item))) items.push(item);
		}
		if (items.length === 0) return [];

		const recipients = await triageRecipients(ctx, project, "critical");
		for (const recipient of recipients) {
			const unsubscribe = await unsubscribeFor(ctx, recipient.userId, project._id, "critical", settingsUrl(project));
			await deliverEmail(ctx, {
				to: recipient.email,
				...criticalSummaryEmail({
					projectName: project.name,
					priority: items[0].priority,
					items: items.slice(0, SUMMARY_LISTED).map((item) => ({
						title: item.title,
						url: feedbackUrl(project, item._id),
					})),
					more: Math.max(0, items.length - SUMMARY_LISTED),
					feedbackUrl: appUrl(`/projects/${encodeURIComponent(project.slug)}/feedback`),
					settingsUrl: settingsUrl(project),
					unsubscribeUrl: unsubscribe.url,
				}),
				headers: unsubscribe.headers,
			});
		}
		return recipients.map((recipient) => recipient.email);
	},
});
