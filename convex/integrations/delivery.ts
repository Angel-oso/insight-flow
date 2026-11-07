import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { isProjectDeleted } from "../access/roles";
import { logAudit } from "../audit/log";
import { appUrl } from "../email/config";
import { signWebhookPayload, webhookUrlFingerprint } from "./signature";

/**
 * Webhook delivery.
 *
 * One `deliver` action per (webhook, feedback item). It POSTs once with a
 * 5 s timeout and never follows redirects (a redirect is a failure, so a
 * public URL cannot bounce the request to an internal one). Network errors,
 * timeouts, 408, 429 and 5xx are retried up to MAX_RETRIES times with
 * backoff; other responses are final. Each delivery that still fails after
 * its retries counts as one consecutive failure, and at AUTO_DISABLE_AFTER
 * the webhook turns itself off. Test sends are never retried and never
 * count. The response body is never read or stored.
 *
 * Headers: X-InsightFlow-Event, X-InsightFlow-Delivery (stable across
 * retries, for de-duplication), X-InsightFlow-Timestamp (seconds) and
 * X-InsightFlow-Signature: sha256=hex(HMAC(secret, `${timestamp}.${body}`)).
 * Payloads never include the submitter's email (or name).
 */
export const TIMEOUT_MS = 5_000;
export const MAX_RETRIES = 3;
/** Wait before retry 1, 2 and 3. */
export const BACKOFF_MS = [30_000, 2 * 60_000, 10 * 60_000] as const;
export const AUTO_DISABLE_AFTER = 10;
const DESCRIPTION_LIMIT = 1000;

const deliveryEvent = v.union(
	v.literal("feedback.created"),
	v.literal("feedback.critical"),
	v.literal("webhook.test"),
);

/** Escapes text for Slack mrkdwn so user content cannot add links or @-mentions. */
export function slackEscape(text: string) {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Re-checks the webhook at delivery time (each attempt, retries included):
 * it must still exist, be enabled (test sends excepted), subscribe to the
 * event, and point at the same URL as when the job was queued. Anything
 * else drops the delivery.
 */
export const prepare = internalQuery({
	args: {
		webhookId: v.id("webhooks"),
		urlFingerprint: v.string(),
		feedbackId: v.optional(v.id("feedback")),
		event: deliveryEvent,
	},
	returns: v.union(
		v.null(),
		v.object({ url: v.string(), secret: v.string(), body: v.string() }),
	),
	handler: async (ctx, { webhookId, urlFingerprint, feedbackId, event }) => {
		const hook = await ctx.db.get("webhooks", webhookId);
		if (!hook) return null;
		const isTest = event === "webhook.test";
		if (!isTest && (!hook.enabled || !hook.events.includes(event))) return null;
		if ((await webhookUrlFingerprint(hook.url)) !== urlFingerprint) return null;
		const project = await ctx.db.get("projects", hook.projectId);
		if (!project || (await isProjectDeleted(ctx, project))) return null;
		const projectInfo = { name: project.name, slug: project.slug };

		if (isTest) {
			const body =
				hook.format === "slack"
					? { text: `Test delivery from InsightFlow for *${slackEscape(project.name)}*. Your webhook is connected.` }
					: { event, test: true, project: projectInfo, feedback: null };
			return { url: hook.url, secret: hook.secret, body: JSON.stringify(body) };
		}

		if (!feedbackId) return null;
		const item = await ctx.db.get("feedback", feedbackId);
		if (!item || item.projectId !== project._id) return null;
		const url = appUrl(`/projects/${encodeURIComponent(project.slug)}/feedback?feedback=${item._id}`);
		const critical = event === "feedback.critical";
		let body: unknown;
		if (hook.format === "slack") {
			const heading = critical ? ":rotating_light: Critical feedback" : "New feedback";
			body = {
				text: [
					`${heading} in *${slackEscape(project.name)}*`,
					`*${slackEscape(item.title)}*`,
					`${slackEscape(item.category)} · ${slackEscape(item.priority)} · ${slackEscape(item.status)}`,
					`<${url}|Open in InsightFlow>`,
				].join("\n"),
			};
		} else {
			body = {
				event,
				test: false,
				project: projectInfo,
				feedback: {
					id: item._id,
					title: item.title,
					description: item.description.slice(0, DESCRIPTION_LIMIT),
					category: item.category,
					priority: item.priority,
					status: item.status,
					receivedAt: new Date(item.receivedAt).toISOString(),
					url,
				},
			};
		}
		return { url: hook.url, secret: hook.secret, body: JSON.stringify(body) };
	},
});

type Outcome = { ok: boolean; status?: number; error?: string; retryable: boolean };

/** One HTTP attempt. Exported for tests. */
export async function attempt(url: string, headers: Record<string, string>, body: string): Promise<Outcome> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			method: "POST",
			headers,
			body,
			redirect: "manual",
			signal: controller.signal,
		});
		// We never read the receiver's body; release the connection.
		await response.body?.cancel().catch(() => {});
		const status = response.status;
		if (status >= 200 && status < 300) return { ok: true, status, retryable: false };
		if (status === 0 || (status >= 300 && status < 400))
			return { ok: false, status, error: "The URL redirected; redirects are not followed.", retryable: false };
		return {
			ok: false,
			status,
			error: `The endpoint answered HTTP ${status}.`,
			retryable: status >= 500 || status === 429 || status === 408,
		};
	} catch {
		return {
			ok: false,
			error: controller.signal.aborted
				? `No response within ${TIMEOUT_MS / 1000} seconds.`
				: "Could not connect to the endpoint.",
			retryable: true,
		};
	} finally {
		clearTimeout(timer);
	}
}

export const deliver = internalAction({
	args: {
		webhookId: v.id("webhooks"),
		// SHA-256 of the URL when the job was queued (see prepare).
		urlFingerprint: v.string(),
		feedbackId: v.optional(v.id("feedback")),
		event: deliveryEvent,
		attempt: v.number(),
		// Set for re-sent critical events (priority raised again later) so
		// the delivery id differs from the earlier delivery's.
		sequence: v.optional(v.number()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const prepared = await ctx.runQuery(internal.integrations.delivery.prepare, {
			webhookId: args.webhookId,
			urlFingerprint: args.urlFingerprint,
			feedbackId: args.feedbackId,
			event: args.event,
		});
		if (!prepared) return null;
		const timestamp = Math.floor(Date.now() / 1000);
		const deliveryId =
			args.event === "webhook.test"
				? `test-${crypto.randomUUID()}`
				: `${args.webhookId}-${args.feedbackId}-${args.event}${args.sequence !== undefined ? `-${args.sequence}` : ""}`;
		const outcome = await attempt(
			prepared.url,
			{
				"Content-Type": "application/json",
				"User-Agent": "InsightFlow-Webhooks/1.0",
				"X-InsightFlow-Event": args.event,
				"X-InsightFlow-Delivery": deliveryId,
				"X-InsightFlow-Timestamp": String(timestamp),
				"X-InsightFlow-Signature": await signWebhookPayload(prepared.secret, timestamp, prepared.body),
			},
			prepared.body,
		);
		const isTest = args.event === "webhook.test";
		const retry = !outcome.ok && outcome.retryable && !isTest && args.attempt <= MAX_RETRIES;
		await ctx.runMutation(internal.integrations.delivery.record, {
			webhookId: args.webhookId,
			ok: outcome.ok,
			status: outcome.status,
			error: outcome.error,
			test: isTest,
			final: !retry,
			retry: retry
				? {
						delayMs: BACKOFF_MS[args.attempt - 1],
						urlFingerprint: args.urlFingerprint,
						feedbackId: args.feedbackId,
						event: args.event,
						attempt: args.attempt + 1,
						sequence: args.sequence,
					}
				: undefined,
		});
		return null;
	},
});

/**
 * Stores the attempt's outcome, schedules the retry (same transaction, so a
 * retry exists only if the result was recorded) and applies auto-disable.
 */
export const record = internalMutation({
	args: {
		webhookId: v.id("webhooks"),
		ok: v.boolean(),
		status: v.optional(v.number()),
		error: v.optional(v.string()),
		test: v.boolean(),
		final: v.boolean(),
		retry: v.optional(
			v.object({
				delayMs: v.number(),
				urlFingerprint: v.string(),
				feedbackId: v.optional(v.id("feedback")),
				event: deliveryEvent,
				attempt: v.number(),
				sequence: v.optional(v.number()),
			}),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const hook = await ctx.db.get("webhooks", args.webhookId);
		if (!hook) return null;
		const now = Date.now();
		const lastDelivery = {
			at: now,
			ok: args.ok,
			test: args.test,
			...(args.status !== undefined ? { status: args.status } : {}),
			...(args.error !== undefined ? { error: args.error.slice(0, 200) } : {}),
		};
		if (args.test) {
			await ctx.db.patch("webhooks", hook._id, { lastDelivery });
			return null;
		}
		if (args.ok) {
			await ctx.db.patch("webhooks", hook._id, { lastDelivery, consecutiveFailures: 0 });
			return null;
		}
		if (!args.final) {
			await ctx.db.patch("webhooks", hook._id, { lastDelivery });
			if (args.retry)
				await ctx.scheduler.runAfter(args.retry.delayMs, internal.integrations.delivery.deliver, {
					webhookId: hook._id,
					urlFingerprint: args.retry.urlFingerprint,
					feedbackId: args.retry.feedbackId,
					event: args.retry.event,
					attempt: args.retry.attempt,
					sequence: args.retry.sequence,
				});
			return null;
		}
		const failures = hook.consecutiveFailures + 1;
		const disable = hook.enabled && failures >= AUTO_DISABLE_AFTER;
		await ctx.db.patch("webhooks", hook._id, {
			lastDelivery,
			consecutiveFailures: failures,
			...(disable
				? {
						enabled: false,
						disabledReason: `Turned off after ${AUTO_DISABLE_AFTER} failed deliveries in a row.`,
						updatedAt: now,
					}
				: {}),
		});
		if (disable) {
			const project = await ctx.db.get("projects", hook.projectId);
			if (project)
				await logAudit(ctx, {
					organizationId: project.organizationId,
					projectId: project._id,
					action: "project.integration_changed",
					summary: `Webhook "${hook.name}" was turned off after ${AUTO_DISABLE_AFTER} failed deliveries in a row`,
				});
		}
		return null;
	},
});
