import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import { logAudit } from "../audit/log";
import { requireCapability, requireProject } from "../feedback/access";
import { enforceUserRateLimit } from "../rateLimits";
import { getMaxPriorityRank, getPriorityRanks } from "../taxonomies/lib";
import { newSecret, webhookUrlFingerprint } from "./signature";
import { validateWebhookUrl } from "./url";

/**
 * Outgoing webhooks (project integrations).
 *
 * Permission: `project.manage`. Members without it see nothing, not even
 * that webhooks exist. The full URL (Slack URLs are themselves secrets) and
 * the signing secret are never returned after creation: the list shows a
 * masked URL, and `create` / `rotateSecret` return the secret exactly once.
 * Every change is audit-logged as `project.integration_changed`.
 *
 * Delivery lives in ./delivery.ts and is scheduled from feedback creation
 * and, for `feedback.critical`, when an item's priority is raised to the
 * top rank (deduped per item, see CRITICAL_WEBHOOK_DEDUPE_MS).
 */
export const MAX_WEBHOOKS = 3;
const MAX_NAME = 60;

export const formatValidator = v.union(v.literal("slack"), v.literal("json"));
export const eventValidator = v.union(v.literal("feedback.created"), v.literal("feedback.critical"));
type WebhookEvent = Doc<"webhooks">["events"][number];

const webhookView = v.object({
	_id: v.id("webhooks"),
	name: v.string(),
	urlPreview: v.string(),
	format: formatValidator,
	events: v.array(eventValidator),
	enabled: v.boolean(),
	consecutiveFailures: v.number(),
	disabledReason: v.optional(v.string()),
	lastDelivery: v.optional(
		v.object({
			at: v.number(),
			ok: v.boolean(),
			status: v.optional(v.number()),
			error: v.optional(v.string()),
			test: v.boolean(),
		}),
	),
	createdAt: v.number(),
});

const MASK_PATH_CHARS = 12;

/**
 * Origin plus a short prefix of the path, so the URL's secret part stays
 * hidden. The query string and fragment (often where tokens live) are never
 * included; anything cut off is marked with "…". This is the only form of a
 * webhook URL that may leave the server (list view, audit summaries).
 */
export function maskUrl(raw: string) {
	try {
		const url = new URL(raw);
		const path = url.pathname === "/" ? "" : url.pathname;
		const cut = path.length > MASK_PATH_CHARS || url.search !== "" || url.hash !== "";
		return `${url.origin}${path.slice(0, MASK_PATH_CHARS)}${cut ? "…" : ""}`;
	} catch {
		return "…";
	}
}

function checkedName(raw: string) {
	const name = raw.trim();
	if (name.length < 1 || name.length > MAX_NAME)
		throw new ConvexError(`Give the webhook a name of 1 to ${MAX_NAME} characters.`);
	return name;
}

function checkedUrl(raw: string) {
	const result = validateWebhookUrl(raw);
	if (!result.ok) throw new ConvexError(result.error);
	return result.url;
}

function checkedEvents(events: readonly WebhookEvent[]) {
	const unique = [...new Set(events)];
	if (unique.length === 0) throw new ConvexError("Choose at least one event.");
	return unique;
}

/** project.manage on a live, non-archived project. */
async function requireManager(ctx: MutationCtx, projectSlug: string) {
	const { project, access } = await requireProject(ctx, projectSlug);
	requireCapability(access.permissions, "project.manage");
	if (project.status === "Archived") throw new ConvexError("Archived projects cannot be edited.");
	return { project, userId: access.user._id };
}

async function requireWebhook(ctx: MutationCtx, project: Doc<"projects">, webhookId: Id<"webhooks">) {
	const hook = await ctx.db.get("webhooks", webhookId);
	if (!hook || hook.projectId !== project._id) throw new ConvexError("Webhook not found.");
	return hook;
}

function audit(ctx: MutationCtx, project: Doc<"projects">, actorId: Id<"users"> | null, summary: string) {
	return logAudit(ctx, {
		organizationId: project.organizationId,
		projectId: project._id,
		actorId,
		action: "project.integration_changed",
		summary,
	});
}

export const list = query({
	args: { projectSlug: v.string() },
	returns: v.object({ canManage: v.boolean(), webhooks: v.array(webhookView) }),
	handler: async (ctx, { projectSlug }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		if (!access.permissions.includes("project.manage")) return { canManage: false, webhooks: [] };
		const hooks = await ctx.db
			.query("webhooks")
			.withIndex("by_projectId", (q) => q.eq("projectId", project._id))
			.take(MAX_WEBHOOKS + 5);
		return {
			canManage: project.status !== "Archived",
			webhooks: hooks.map((hook) => ({
				_id: hook._id,
				name: hook.name,
				urlPreview: maskUrl(hook.url),
				format: hook.format,
				events: hook.events,
				enabled: hook.enabled,
				consecutiveFailures: hook.consecutiveFailures,
				disabledReason: hook.disabledReason,
				lastDelivery: hook.lastDelivery,
				createdAt: hook.createdAt,
			})),
		};
	},
});

/** Adds a webhook. Returns its signing secret — shown to the user once. */
export const create = mutation({
	args: {
		projectSlug: v.string(),
		name: v.string(),
		url: v.string(),
		format: formatValidator,
		events: v.array(eventValidator),
	},
	returns: v.object({ webhookId: v.id("webhooks"), secret: v.string() }),
	handler: async (ctx, args) => {
		await enforceUserRateLimit(ctx, "webhookConfig");
		const { project, userId } = await requireManager(ctx, args.projectSlug);
		const name = checkedName(args.name);
		const url = checkedUrl(args.url);
		const events = checkedEvents(args.events);
		const existing = await ctx.db
			.query("webhooks")
			.withIndex("by_projectId", (q) => q.eq("projectId", project._id))
			.take(MAX_WEBHOOKS);
		if (existing.length >= MAX_WEBHOOKS)
			throw new ConvexError(`A project can have at most ${MAX_WEBHOOKS} webhooks.`);
		const now = Date.now();
		const secret = newSecret("whsec_");
		const webhookId = await ctx.db.insert("webhooks", {
			projectId: project._id,
			name,
			url,
			format: args.format,
			events,
			secret,
			enabled: true,
			consecutiveFailures: 0,
			createdBy: userId,
			createdAt: now,
			updatedAt: now,
		});
		await audit(ctx, project, userId, `Added webhook "${name}" (${maskUrl(url)})`);
		return { webhookId, secret };
	},
});

export const update = mutation({
	args: {
		projectSlug: v.string(),
		webhookId: v.id("webhooks"),
		name: v.optional(v.string()),
		url: v.optional(v.string()),
		format: v.optional(formatValidator),
		events: v.optional(v.array(eventValidator)),
		enabled: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await enforceUserRateLimit(ctx, "webhookConfig");
		const { project, userId } = await requireManager(ctx, args.projectSlug);
		const hook = await requireWebhook(ctx, project, args.webhookId);
		const patch: Partial<Doc<"webhooks">> = { updatedAt: Date.now() };
		const changes: string[] = [];
		if (args.name !== undefined) {
			patch.name = checkedName(args.name);
			changes.push("name");
		}
		if (args.url !== undefined) {
			patch.url = checkedUrl(args.url);
			changes.push(`URL (${maskUrl(patch.url)})`);
		}
		if (args.format !== undefined) {
			patch.format = args.format;
			changes.push(`format ${args.format}`);
		}
		if (args.events !== undefined) {
			patch.events = checkedEvents(args.events);
			changes.push(`events ${patch.events.join(", ")}`);
		}
		if (args.enabled !== undefined && args.enabled !== hook.enabled) {
			patch.enabled = args.enabled;
			changes.push(args.enabled ? "enabled" : "disabled");
		}
		// Re-enabling (or pointing at a new URL) starts the failure count over.
		if (patch.enabled === true || patch.url !== undefined) {
			patch.consecutiveFailures = 0;
			patch.disabledReason = undefined;
		}
		if (changes.length === 0) return null;
		await ctx.db.patch("webhooks", hook._id, patch);
		await audit(ctx, project, userId, `Updated webhook "${hook.name}": ${changes.join("; ")}`);
		return null;
	},
});

/** Replaces the signing secret. Returns the new one — shown once. */
export const rotateSecret = mutation({
	args: { projectSlug: v.string(), webhookId: v.id("webhooks") },
	returns: v.object({ secret: v.string() }),
	handler: async (ctx, { projectSlug, webhookId }) => {
		await enforceUserRateLimit(ctx, "webhookConfig");
		const { project, userId } = await requireManager(ctx, projectSlug);
		const hook = await requireWebhook(ctx, project, webhookId);
		const secret = newSecret("whsec_");
		await ctx.db.patch("webhooks", hook._id, { secret, updatedAt: Date.now() });
		await audit(ctx, project, userId, `Rotated the signing secret of webhook "${hook.name}"`);
		return { secret };
	},
});

export const remove = mutation({
	args: { projectSlug: v.string(), webhookId: v.id("webhooks") },
	returns: v.null(),
	handler: async (ctx, { projectSlug, webhookId }) => {
		await enforceUserRateLimit(ctx, "webhookConfig");
		const { project, userId } = await requireManager(ctx, projectSlug);
		const hook = await requireWebhook(ctx, project, webhookId);
		await ctx.db.delete("webhooks", hook._id);
		await audit(ctx, project, userId, `Removed webhook "${hook.name}" (${maskUrl(hook.url)})`);
		return null;
	},
});

/** Queues one test delivery; its result shows up as the webhook's last delivery. */
export const sendTest = mutation({
	args: { projectSlug: v.string(), webhookId: v.id("webhooks") },
	returns: v.null(),
	handler: async (ctx, { projectSlug, webhookId }) => {
		await enforceUserRateLimit(ctx, "webhookTest");
		const { project } = await requireManager(ctx, projectSlug);
		const hook = await requireWebhook(ctx, project, webhookId);
		await ctx.scheduler.runAfter(0, internal.integrations.delivery.deliver, {
			webhookId: hook._id,
			urlFingerprint: await webhookUrlFingerprint(hook.url),
			event: "webhook.test",
			attempt: 1,
		});
		return null;
	},
});

/** At most one `feedback.critical` dispatch per item in this window. */
export const CRITICAL_WEBHOOK_DEDUPE_MS = 6 * 60 * 60_000;
const CRITICAL_LOG_RETENTION_MS = 2 * CRITICAL_WEBHOOK_DEDUPE_MS;
const PURGE_BATCH = 500;

/** The item, its project's enabled webhooks and whether it is critical. */
async function deliveryTarget(ctx: MutationCtx, feedbackId: Id<"feedback">) {
	const item = await ctx.db.get("feedback", feedbackId);
	if (!item) return null;
	const hooks = (
		await ctx.db
			.query("webhooks")
			.withIndex("by_projectId", (q) => q.eq("projectId", item.projectId))
			.take(MAX_WEBHOOKS + 5)
	).filter((hook) => hook.enabled);
	if (hooks.length === 0) return null;
	const project = await ctx.db.get("projects", item.projectId);
	if (!project || project.deletionRequestedAt !== undefined) return null;
	const [ranks, maxRank] = await Promise.all([
		getPriorityRanks(ctx, project.organizationId),
		getMaxPriorityRank(ctx, project.organizationId),
	]);
	return { item, hooks, critical: ranks.get(item.priority) === maxRank };
}

async function criticalDispatchedSince(ctx: MutationCtx, feedbackId: Id<"feedback">, since: number) {
	const recent = await ctx.db
		.query("webhookCriticalLog")
		.withIndex("by_feedbackId_at", (q) => q.eq("feedbackId", feedbackId).gte("at", since))
		.first();
	return recent !== null;
}

/**
 * Call after a feedback row is inserted (same mutation). Schedules one
 * delivery per enabled webhook that subscribes to the event: critical items
 * (top priority rank) go out as `feedback.critical` to webhooks that want
 * them, everything else as `feedback.created`. A critical dispatch is logged
 * so raising the same item again soon (scheduleCriticalWebhook) is deduped.
 */
export async function scheduleWebhookDeliveries(ctx: MutationCtx, feedbackId: Id<"feedback">) {
	const target = await deliveryTarget(ctx, feedbackId);
	if (!target) return;
	const { item, hooks, critical } = target;
	let sentCritical = false;
	for (const hook of hooks) {
		const event: WebhookEvent | null =
			critical && hook.events.includes("feedback.critical")
				? "feedback.critical"
				: hook.events.includes("feedback.created")
					? "feedback.created"
					: null;
		if (!event) continue;
		if (event === "feedback.critical") sentCritical = true;
		await ctx.scheduler.runAfter(0, internal.integrations.delivery.deliver, {
			webhookId: hook._id,
			urlFingerprint: await webhookUrlFingerprint(hook.url),
			feedbackId,
			event,
			attempt: 1,
		});
	}
	if (sentCritical)
		await ctx.db.insert("webhookCriticalLog", { projectId: item.projectId, feedbackId, at: Date.now() });
}

/**
 * Call after an item's priority changes (same mutation, after the write).
 * When it now sits at the top rank, sends `feedback.critical` to the
 * webhooks that subscribe to it, at most once per item per
 * CRITICAL_WEBHOOK_DEDUPE_MS (creation as critical counts). Payloads are
 * built by delivery.ts and never include the submitter's email or name.
 */
export async function scheduleCriticalWebhook(ctx: MutationCtx, feedbackId: Id<"feedback">) {
	const target = await deliveryTarget(ctx, feedbackId);
	if (!target?.critical) return;
	const hooks = target.hooks.filter((hook) => hook.events.includes("feedback.critical"));
	if (hooks.length === 0) return;
	const now = Date.now();
	if (await criticalDispatchedSince(ctx, feedbackId, now - CRITICAL_WEBHOOK_DEDUPE_MS)) return;
	await ctx.db.insert("webhookCriticalLog", { projectId: target.item.projectId, feedbackId, at: now });
	for (const hook of hooks) {
		await ctx.scheduler.runAfter(0, internal.integrations.delivery.deliver, {
			webhookId: hook._id,
			urlFingerprint: await webhookUrlFingerprint(hook.url),
			feedbackId,
			event: "feedback.critical",
			attempt: 1,
			// A new delivery id, so receivers don't drop it as a repeat of an
			// earlier critical delivery for the same item.
			sequence: now,
		});
	}
}

/** Daily cron: trims the critical dedupe ledger once rows are past the window. */
export const purgeCriticalLog = internalMutation({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		const rows = await ctx.db
			.query("webhookCriticalLog")
			.withIndex("by_at", (q) => q.lt("at", Date.now() - CRITICAL_LOG_RETENTION_MS))
			.take(PURGE_BATCH);
		for (const row of rows) await ctx.db.delete("webhookCriticalLog", row._id);
		if (rows.length === PURGE_BATCH)
			await ctx.scheduler.runAfter(0, internal.integrations.webhooks.purgeCriticalLog, {});
		return rows.length;
	},
});

/** Removes a project's webhooks (project purge). At most a handful exist. */
export async function deleteProjectWebhooks(ctx: MutationCtx, projectId: Id<"projects">) {
	const hooks = await ctx.db
		.query("webhooks")
		.withIndex("by_projectId", (q) => q.eq("projectId", projectId))
		.take(50);
	for (const hook of hooks) await ctx.db.delete("webhooks", hook._id);
	return hooks.length;
}
