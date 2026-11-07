/**
 * Email environment, read at call time so tests and `npx convex env set`
 * changes apply without a redeploy of module state.
 *
 * - BREVO_API_KEY   Brevo API key (transactional email, convex/email/brevo.ts).
 * - EMAIL_FROM      Sender verified in Brevo, e.g. "InsightFlow <you@gmail.com>".
 *                   Brevo accepts a single verified address, no domain needed.
 * - SITE_URL        App origin used for every link in an email.
 * - EMAIL_DEV_LOG   "true" logs emails (and auth codes) to the Convex log
 *                   instead of sending them. For local development only.
 */
export type EmailMode = "log" | "send" | "disabled";

function env(name: string): string | undefined {
	const value = typeof process === "undefined" ? undefined : process.env[name];
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function brevoApiKey() {
	return env("BREVO_API_KEY");
}

/** Sending needs both the key and a sender; otherwise email is disabled. */
export function emailMode(): EmailMode {
	if (env("EMAIL_DEV_LOG") === "true") return "log";
	return brevoApiKey() && env("EMAIL_FROM") ? "send" : "disabled";
}

export function emailFrom() {
	return env("EMAIL_FROM") ?? "";
}

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** "Name <a@b.c>" or "a@b.c" → Brevo sender object, or null if malformed. */
export function parseSender(value: string): { email: string; name?: string } | null {
	const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(value);
	const email = (match ? match[2] : value).trim();
	if (!ADDRESS.test(email)) return null;
	const name = match?.[1]?.replace(/^"|"$/g, "").trim();
	return name ? { email, name } : { email };
}

/** App origin without a trailing slash; falls back to localhost for dev. */
export function siteUrl() {
	return (env("SITE_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function appUrl(path: string) {
	return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
