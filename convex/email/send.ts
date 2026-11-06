import { Resend } from "@convex-dev/resend";
import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalMutation, type ActionCtx, type MutationCtx } from "../_generated/server";
import { emailFrom, emailMode, resendTestMode } from "./config";
import { authCodeEmail, type EmailContent } from "./templates";

/** Abuse limits for emails a visitor can trigger without being a member. */
export const emailRateLimiter = new RateLimiter(components.rateLimiter, {
	// Sign-up verification and password reset codes, per address.
	authCode: { kind: "token bucket", rate: 5, period: 15 * MINUTE, capacity: 5 },
	// Wrong sign-up verification / password reset codes, per normalized
	// address (convex/email/authGuards.ts). Five misses invalidate the
	// outstanding code; ~10 guesses an hour against 10^8 codes.
	authCodeVerify: { kind: "token bucket", rate: 10, period: 60 * MINUTE, capacity: 5 },
	// Email-change codes, per signed-in user.
	emailChangeCode: { kind: "token bucket", rate: 5, period: 60 * MINUTE, capacity: 3 },
});

export type DeliveryResult = "sent" | "logged" | "skipped";

export function resendClient() {
	// testMode stays on only when explicitly asked for (staging with
	// *@resend.dev recipients). With a real key and domain it must be off,
	// or the component rejects every real recipient. Webhook events
	// (RESEND_WEBHOOK_SECRET, /resend-webhook) feed bounce suppression.
	return new Resend(components.resend, {
		testMode: resendTestMode(),
		onEmailEvent: internal.notifications.suppression.onEmailEvent,
	});
}

export type EmailHeader = { name: string; value: string };

/**
 * Single delivery point for every email. Queues through the Resend
 * component (durable, retried, idempotent) or, with EMAIL_DEV_LOG=true,
 * prints the message to the Convex log so local development needs no
 * email provider. Without a key it logs an error and skips: notifications
 * never break the write that triggered them.
 */
export async function deliverEmail(
	ctx: MutationCtx | ActionCtx,
	message: EmailContent & { to: string; idempotencyKey?: string; headers?: EmailHeader[] },
): Promise<DeliveryResult> {
	const mode = emailMode();
	if (mode === "log") {
		const headers = (message.headers ?? [])
			.map((header) => `${header.name}: ${header.value}\n`)
			.join("");
		console.log(
			`[email:dev] to=${message.to} subject="${message.subject}"\n${headers}${message.text}`,
		);
		return "logged";
	}
	if (mode === "disabled") {
		console.error(
			`[email] RESEND_API_KEY is not set; skipped "${message.subject}" to ${message.to}.`,
		);
		return "skipped";
	}
	await resendClient().sendEmail(ctx, {
		from: emailFrom(),
		to: message.to,
		subject: message.subject,
		html: message.html,
		text: message.text,
		...(message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : {}),
		...(message.headers?.length ? { headers: message.headers } : {}),
	});
	return "sent";
}

/**
 * Auth code delivery, called from the Convex Auth email providers. Runs as a
 * mutation so the per-address rate limit is transactional.
 */
export const sendAuthCode = internalMutation({
	args: {
		purpose: v.union(v.literal("verify"), v.literal("reset")),
		email: v.string(),
		code: v.string(),
		expiresAt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, { purpose, email, code, expiresAt }) => {
		const limit = await emailRateLimiter.limit(ctx, "authCode", {
			key: email.trim().toLowerCase(),
		});
		if (!limit.ok) {
			throw new ConvexError(
				"Too many codes were requested for this email. Wait a few minutes and try again.",
			);
		}
		const result = await deliverEmail(ctx, {
			to: email,
			...authCodeEmail({ purpose, code, expires: new Date(expiresAt) }),
		});
		if (result === "skipped") {
			throw new ConvexError(
				"We couldn't send the email because email delivery isn't configured yet. Contact your administrator.",
			);
		}
		return null;
	},
});
