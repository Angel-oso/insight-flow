import { ConvexError } from "convex/values";

export type AuthFlow =
	| "signIn"
	| "signUp"
	| "verify"
	| "resend"
	| "reset"
	| "reset-verification"
	| "google";

const fallback: Record<AuthFlow, string> = {
	signIn: "We couldn't sign you in. Check your email and password and try again.",
	signUp: "We couldn't create the account. Try again in a moment.",
	verify: "That code didn't work. Check the latest email or request a new code.",
	resend: "We couldn't send a new code. Wait a few minutes and try again.",
	reset: "We couldn't send a reset code. Try again in a moment.",
	"reset-verification":
		"That code didn't work. Check the latest email or request a new code.",
	google: "Google sign-in failed. Try again.",
};

/**
 * User-facing message for a Convex Auth failure. Our own validation throws
 * ConvexError with readable text; library errors are redacted in
 * production, so known development messages are mapped and everything else
 * falls back to a per-flow message that doesn't reveal whether an account
 * exists.
 */
export function authErrorMessage(error: unknown, flow: AuthFlow): string {
	if (error instanceof ConvexError && typeof error.data === "string") {
		return error.data;
	}
	const message = error instanceof Error ? error.message : "";
	if (/TooManyFailedAttempts/.test(message)) {
		return "Too many attempts. Wait a few minutes and try again.";
	}
	// Only the sign-in form talks about credentials; the sign-up steps answer
	// the same way whether or not the address already had an account.
	if (/InvalidAccountId|InvalidSecret|Invalid credentials/.test(message)) {
		return flow === "signIn" ? fallback.signIn : fallback[flow];
	}
	if (/Failed to fetch|NetworkError|network/i.test(message)) {
		return "We couldn't reach the server. Check your connection and try again.";
	}
	return fallback[flow];
}

export function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
