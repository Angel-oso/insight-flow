import { ConvexError } from "convex/values";

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Widget `action` the form renders with; checked when Cloudflare echoes it. */
export const TURNSTILE_ACTION = "intake";
const VERIFY_TIMEOUT_MS = 10_000;

const UNAVAILABLE = "Feedback submissions are temporarily unavailable. Please try again later.";
const FAILED = "We couldn't verify that you're human. Complete the check and try again.";

type SiteverifyResponse = { success?: unknown; action?: unknown; "error-codes"?: unknown };

/**
 * Verifies a Cloudflare Turnstile token server-side. Fails CLOSED: without
 * `TURNSTILE_SECRET_KEY` every submission is rejected, unless
 * `INTAKE_CAPTCHA_DISABLED` is exactly "true" (local development only).
 * Tokens are single-use, so a replayed token also fails.
 */
export async function verifyCaptcha(token: string | undefined) {
	const secret = process.env.TURNSTILE_SECRET_KEY;
	if (!secret) {
		if (process.env.INTAKE_CAPTCHA_DISABLED === "true") return;
		console.error("Public intake rejected: TURNSTILE_SECRET_KEY is not set.");
		throw new ConvexError(UNAVAILABLE);
	}
	if (!token || token.length > 2048) throw new ConvexError(FAILED);

	const body = new URLSearchParams({ secret, response: token });
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
	let result: SiteverifyResponse;
	try {
		const response = await fetch(TURNSTILE_VERIFY_URL, {
			method: "POST",
			body,
			signal: controller.signal,
		});
		if (!response.ok) throw new Error(`siteverify responded ${response.status}`);
		result = (await response.json()) as SiteverifyResponse;
	} catch (error) {
		console.error("Turnstile verification unavailable:", error);
		throw new ConvexError(FAILED);
	} finally {
		clearTimeout(timer);
	}
	if (result.success !== true) {
		console.warn("Turnstile rejected a token:", result["error-codes"]);
		throw new ConvexError(FAILED);
	}
	if (typeof result.action === "string" && result.action !== TURNSTILE_ACTION) {
		throw new ConvexError(FAILED);
	}
}
