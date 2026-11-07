import { ConvexError } from "convex/values";

/**
 * Message safe to show to a user. Server `ConvexError`s carry their text in
 * `data`; any other error thrown by the Convex client has a message with
 * request ids and stack context (`[CONVEX M(...)] [Request ID: ...]`) that
 * must never reach the UI, so it falls back. Plain client-side errors
 * (thrown by our own form code) keep their message.
 */
export function userFacingError(cause: unknown, fallback: string) {
	if (cause instanceof ConvexError) {
		return typeof cause.data === "string" ? cause.data : fallback;
	}
	if (cause instanceof Error && cause.message && !cause.message.includes("[CONVEX") && !cause.message.includes("Request ID")) {
		return cause.message;
	}
	return fallback;
}
