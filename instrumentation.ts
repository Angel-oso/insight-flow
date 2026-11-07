import * as Sentry from "@sentry/nextjs";

export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		await import("./sentry.server.config");
	}
	if (process.env.NEXT_RUNTIME === "edge") {
		await import("./sentry.edge.config");
	}
}

// Reports errors from Server Components, route handlers, server actions and
// proxy. A no-op when Sentry is not initialized (no DSN).
export const onRequestError = Sentry.captureRequestError;
