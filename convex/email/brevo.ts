import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { brevoApiKey, parseSender } from "./config";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
/** Attempts after the first one, for rate limits, 5xx and network errors. */
export const MAX_RETRIES = 4;
const BASE_DELAY_MS = 30_000;

/**
 * Sends one email through Brevo's transactional API. Scheduled by
 * deliverEmail (convex/email/send.ts) so the write that triggers an email
 * commits first and a slow or failing provider never blocks it. Transient
 * failures are retried with backoff; a final failure throws, so the failed
 * job shows up in ops monitoring (convex/monitoring).
 */
export const send = internalAction({
	args: {
		from: v.string(),
		to: v.string(),
		subject: v.string(),
		html: v.string(),
		text: v.string(),
		headers: v.optional(v.record(v.string(), v.string())),
		attempt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const apiKey = brevoApiKey();
		if (!apiKey) throw new Error("BREVO_API_KEY is not set; email not sent.");
		const sender = parseSender(args.from);
		if (!sender) throw new Error("EMAIL_FROM is not a valid address; email not sent.");

		let status = 0;
		let detail = "";
		try {
			const response = await fetch(BREVO_SEND_URL, {
				method: "POST",
				headers: {
					"api-key": apiKey,
					"content-type": "application/json",
					accept: "application/json",
				},
				body: JSON.stringify({
					sender,
					to: [{ email: args.to }],
					subject: args.subject,
					htmlContent: args.html,
					textContent: args.text,
					...(args.headers ? { headers: args.headers } : {}),
				}),
			});
			if (response.ok) return null;
			status = response.status;
			detail = (await response.text()).slice(0, 300);
		} catch (error) {
			detail = error instanceof Error ? error.message : String(error);
		}

		const retryable = status === 0 || status === 429 || status >= 500;
		if (retryable && args.attempt < MAX_RETRIES) {
			const delay = BASE_DELAY_MS * 2 ** args.attempt;
			console.warn(`[email] Brevo send failed (${status || "network"}); retrying in ${delay / 1000}s.`);
			await ctx.scheduler.runAfter(delay, internal.email.brevo.send, { ...args, attempt: args.attempt + 1 });
			return null;
		}
		throw new Error(`Brevo rejected "${args.subject}" (${status || "network"}): ${detail}`);
	},
});
