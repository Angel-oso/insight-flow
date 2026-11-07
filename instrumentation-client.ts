// Sentry for the browser. A no-op unless NEXT_PUBLIC_SENTRY_DSN is set.
// Events go through the same-origin tunnel (`/monitoring`, configured in
// next.config.ts), so the CSP needs no Sentry ingest origin.
// Session Replay is deliberately not enabled: it would record feedback content.
import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "./sentry.shared.config";

Sentry.init({
	...sharedSentryOptions,
	environment:
		process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
		process.env.NEXT_PUBLIC_VERCEL_ENV ??
		process.env.NODE_ENV,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
