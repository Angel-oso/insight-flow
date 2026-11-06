/**
 * HMAC-SHA256 helpers (Web Crypto, available in the default Convex runtime).
 *
 * Webhook receivers verify a delivery by recomputing
 *   hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`))
 * and comparing it, in constant time, with the `sha256=` value of the
 * `X-InsightFlow-Signature` header. The timestamp (seconds, also sent as
 * `X-InsightFlow-Timestamp`) lets them reject replays older than a few
 * minutes.
 */
const encoder = new TextEncoder();

export async function hmacSha256Hex(secret: string, message: string) {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
	return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signWebhookPayload(secret: string, timestamp: number, body: string) {
	return `sha256=${await hmacSha256Hex(secret, `${timestamp}.${body}`)}`;
}

/** Constant-time comparison for equal-length hex strings. */
export function safeEqual(a: string, b: string) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
	return diff === 0;
}

/** 32 random bytes as hex, prefixed so users recognize it. */
export function newSecret(prefix: string) {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return prefix + [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * SHA-256 of a webhook URL. Queued deliveries carry this instead of the URL
 * (Slack URLs are secrets), so a delivery queued before the URL changed is
 * dropped rather than sent to the new address.
 */
export async function webhookUrlFingerprint(url: string) {
	return await sha256Hex(url);
}

/** Hex SHA-256 of a string (also hashes stored upload tickets). */
export async function sha256Hex(text: string) {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
