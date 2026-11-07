import { NextResponse, type NextRequest } from "next/server";

/*
 * Per-request, nonce-based Content Security Policy.
 *
 * Convex Auth keeps the session token in localStorage, so a successful XSS
 * would mean session theft. The policy below only executes scripts that carry
 * this request's nonce (Next.js adds it to its own framework, page and inline
 * scripts) or that such a script loads ('strict-dynamic'), e.g. next/script
 * tags and the Cloudflare Turnstile loader.
 *
 * A nonce requires dynamic rendering: the root layout reads `x-nonce`, which
 * opts every page out of static prerendering.
 */

const isDev = process.env.NODE_ENV === "development";

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

function origin(url: string | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

/** `https://x` -> `wss://x`, `http://x` -> `ws://x`. */
function socketOrigin(httpOrigin: string): string {
	return httpOrigin.replace(/^http/, "ws");
}

const convexOrigin = origin(process.env.NEXT_PUBLIC_CONVEX_URL);
// HTTP actions (OAuth sign-in redirects and callbacks) live on `.convex.site`.
const convexSiteOrigin =
	origin(process.env.NEXT_PUBLIC_CONVEX_SITE_URL) ??
	(convexOrigin?.endsWith(".convex.cloud")
		? convexOrigin.replace(/\.convex\.cloud$/, ".convex.site")
		: null);

function buildCsp(nonce: string): string {
	const connect = ["'self'", TURNSTILE_ORIGIN];
	if (convexOrigin) connect.push(convexOrigin, socketOrigin(convexOrigin));
	if (convexSiteOrigin) connect.push(convexSiteOrigin);
	if (isDev) connect.push("ws://localhost:*", "ws://127.0.0.1:*");

	const formAction = ["'self'"];
	if (convexSiteOrigin) formAction.push(convexSiteOrigin);

	const directives: Record<string, string[]> = {
		"default-src": ["'self'"],
		"script-src": [
			"'self'",
			`'nonce-${nonce}'`,
			"'strict-dynamic'",
			// Ignored by browsers that support 'strict-dynamic'; fallback for older ones.
			TURNSTILE_ORIGIN,
			...(isDev ? ["'unsafe-eval'"] : []),
		],
		// Style attributes (React `style={}` in SSR HTML, Base UI, charts) cannot
		// carry a nonce, so inline styles stay allowed. Style injection cannot
		// execute script.
		"style-src": ["'self'", "'unsafe-inline'"],
		// Feedback attachments are served as short-lived signed links from the
		// Convex HTTP origin (convex/attachments/http.ts).
		"img-src": ["'self'", "blob:", "data:", ...(convexSiteOrigin ? [convexSiteOrigin] : [])],
		// next/font self-hosts every font under /_next/static.
		"font-src": ["'self'", "data:"],
		"connect-src": connect,
		"frame-src": [TURNSTILE_ORIGIN],
		"worker-src": ["'self'", "blob:"],
		"manifest-src": ["'self'"],
		"object-src": ["'none'"],
		"base-uri": ["'self'"],
		"form-action": formAction,
		"frame-ancestors": ["'none'"],
	};

	const policy = Object.entries(directives).map(
		([name, values]) => `${name} ${values.join(" ")}`,
	);
	// Only upgrade when the backend itself is served over TLS, so a local
	// `pnpm start` against `http://127.0.0.1:3210` keeps working.
	if (!isDev && convexOrigin?.startsWith("https://")) {
		policy.push("upgrade-insecure-requests");
	}
	return policy.join("; ");
}

export function proxy(request: NextRequest) {
	const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
	const csp = buildCsp(nonce);

	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-nonce", nonce);
	requestHeaders.set("Content-Security-Policy", csp);

	const response = NextResponse.next({ request: { headers: requestHeaders } });
	response.headers.set("Content-Security-Policy", csp);
	return response;
}

export const config = {
	matcher: [
		/*
		 * Every document request except static assets, image optimization,
		 * the Sentry tunnel (`/monitoring`), metadata files, and prefetches.
		 */
		{
			// Exclusions are anchored (whole segment or exact file), so look-alike
			// paths such as /monitoringx still get the CSP.
			source:
				"/((?!(?:monitoring|_next/static|_next/image)(?:/|$)|(?:favicon\\.ico|icon\\.svg|logo\\.svg|robots\\.txt|sitemap\\.xml)$).*)",
			missing: [
				{ type: "header", key: "next-router-prefetch" },
				{ type: "header", key: "purpose", value: "prefetch" },
			],
		},
	],
};
