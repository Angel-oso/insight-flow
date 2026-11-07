// Sentry for the edge runtime. Loaded from instrumentation.ts.
// A no-op unless NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "./sentry.shared.config";

Sentry.init({
	...sharedSentryOptions,
	environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
