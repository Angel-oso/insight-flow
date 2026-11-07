// Options shared by every Sentry runtime (browser, Node.js, edge).
// Sentry v11 replaced `sendDefaultPii` with `dataCollection`, whose defaults
// collect user info, cookies, headers, bodies, and query params. InsightFlow
// handles feedback content, invitation tokens, and auth sessions, so collection
// is opted out category by category: errors still carry stack traces and the
// route, but no personal or request data.
//
// Invitation links carry their secret in the path (`/invitations/<token>`),
// which `dataCollection` does not cover, so URLs, breadcrumbs and span or
// transaction names are rewritten to `/invitations/[token]` before anything
// leaves the process. The URL-encoded form (the login redirect's
// `?next=%2Finvitations%2F…`) is scrubbed too.
import type { BrowserOptions } from "@sentry/nextjs";

export const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

const INVITATION_PATH =
	/(\/|%2F)invitations(\/|%2F)(?!\[token\]|%5Btoken%5D)[^/?#&\s"'%]+/gi;

/** Replaces invitation tokens in a URL, path, or span/transaction name. */
export function scrubInvitationTokens(text: string): string {
	return text.replace(INVITATION_PATH, "$1invitations$2[token]");
}

function scrubValue(value: unknown): unknown {
	if (typeof value === "string") return scrubInvitationTokens(value);
	// Span attributes may be `{ value, unit }` objects.
	if (value && typeof value === "object" && "value" in value) {
		const attribute = value as { value: unknown };
		return typeof attribute.value === "string"
			? { ...attribute, value: scrubInvitationTokens(attribute.value) }
			: value;
	}
	return value;
}

/** Scrubs the string values of a flat record (breadcrumb data, span attributes). */
function scrubRecord<T extends Record<string, unknown>>(record: T): T {
	const next: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) next[key] = scrubValue(value);
	return next as T;
}

export const sharedSentryOptions = {
	dsn: sentryDsn,
	// Without a DSN the SDK stays disabled and sends nothing.
	enabled: Boolean(sentryDsn),
	// Conservative performance sampling; errors are always captured.
	tracesSampleRate: 0.05,
	dataCollection: {
		userInfo: false,
		cookies: false,
		httpHeaders: false,
		httpBodies: [],
		urlQueryParams: false,
		databaseQueryData: false,
		stackFrameVariables: false,
		genAI: { inputs: false, outputs: false },
		mcp: { inputs: false, outputs: false },
	},
	beforeSend(event) {
		if (event.request?.url) event.request.url = scrubInvitationTokens(event.request.url);
		if (event.transaction) event.transaction = scrubInvitationTokens(event.transaction);
		// Breadcrumbs normally pass beforeBreadcrumb; scrub again for any an
		// integration attached to the scope directly.
		if (event.breadcrumbs) {
			event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
				...breadcrumb,
				...(breadcrumb.message ? { message: scrubInvitationTokens(breadcrumb.message) } : {}),
				...(breadcrumb.data ? { data: scrubRecord(breadcrumb.data) } : {}),
			}));
		}
		return event;
	},
	beforeBreadcrumb(breadcrumb) {
		// navigation (data.from / data.to), fetch and xhr (data.url), console.
		if (breadcrumb.message) breadcrumb.message = scrubInvitationTokens(breadcrumb.message);
		if (breadcrumb.data) breadcrumb.data = scrubRecord(breadcrumb.data);
		return breadcrumb;
	},
	// v11 streams spans by default (`traceLifecycle: "stream"`): span and
	// segment (transaction) names and URL attributes go through this hook, and
	// `beforeSendTransaction` is ignored in that mode.
	beforeSendSpan(span) {
		return {
			...span,
			name: scrubInvitationTokens(span.name),
			attributes: scrubRecord(span.attributes),
		};
	},
} satisfies BrowserOptions;
