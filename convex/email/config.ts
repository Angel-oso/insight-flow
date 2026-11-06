/**
 * Email environment, read at call time so tests and `npx convex env set`
 * changes apply without a redeploy of module state.
 *
 * - RESEND_API_KEY  Resend API key (read by the @convex-dev/resend component).
 * - EMAIL_FROM      Sender, e.g. "InsightFlow <no-reply@yourdomain.com>".
 * - SITE_URL        App origin used for every link in an email.
 * - EMAIL_DEV_LOG   "true" logs emails (and auth codes) to the Convex log
 *                   instead of sending them. For local development only.
 * - RESEND_TEST_MODE "true" keeps the component in Resend test mode: only
 *                   *@resend.dev test recipients are accepted (staging).
 */
export type EmailMode = "log" | "send" | "disabled";

const DEFAULT_FROM = "InsightFlow <onboarding@resend.dev>";

function env(name: string): string | undefined {
	const value = typeof process === "undefined" ? undefined : process.env[name];
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function emailMode(): EmailMode {
	if (env("EMAIL_DEV_LOG") === "true") return "log";
	return env("RESEND_API_KEY") ? "send" : "disabled";
}

export function emailFrom() {
	return env("EMAIL_FROM") ?? DEFAULT_FROM;
}

export function resendTestMode() {
	return env("RESEND_TEST_MODE") === "true";
}

/** App origin without a trailing slash; falls back to localhost for dev. */
export function siteUrl() {
	return (env("SITE_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function appUrl(path: string) {
	return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
