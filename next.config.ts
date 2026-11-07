import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { LEGAL } from "./lib/legal";

// The Content-Security-Policy is per request (nonce-based) and lives in
// proxy.ts. These headers are static and apply to every response.
const securityHeaders = [
	{
		key: "Strict-Transport-Security",
		// Add "; preload" only after confirming every subdomain serves HTTPS:
		// preload lists are hard to leave.
		value: "max-age=63072000; includeSubDomains",
	},
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "X-Frame-Options", value: "DENY" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{
		key: "Permissions-Policy",
		value: "camera=(), microphone=(), geolocation=()",
	},
];

// Opt-in guard (REQUIRE_LEGAL_VALUES=true): refuse to build while /privacy
// and /terms still show "[...]" placeholders from lib/legal.ts.
const requireLegalValues = process.env.REQUIRE_LEGAL_VALUES === "true";
if (requireLegalValues) {
	const pending = Object.entries(LEGAL)
		.filter(([, value]) => /^\[.*\]$/.test(value))
		.map(([key]) => key);
	if (pending.length > 0) {
		throw new Error(
			`lib/legal.ts still has placeholders (${pending.join(", ")}). Fill them in before a production deploy.`,
		);
	}
}

// The URL of an invitation is its secret, and public forms belong to each
// customer: never index either (robots.txt lets crawlers fetch them so they
// see this header).
const noIndex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
	poweredByHeader: false,
	async headers() {
		return [
			{ source: "/:path*", headers: securityHeaders },
			{ source: "/invitations/:path*", headers: noIndex },
			{ source: "/f/:path*", headers: noIndex },
		];
	},
};

// Sentry is opt-in: without NEXT_PUBLIC_SENTRY_DSN the build is untouched.
// Source maps are uploaded only when SENTRY_AUTH_TOKEN is present.
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default sentryEnabled
	? withSentryConfig(nextConfig, {
			org: process.env.SENTRY_ORG,
			project: process.env.SENTRY_PROJECT,
			authToken: process.env.SENTRY_AUTH_TOKEN,
			silent: !process.env.CI,
			telemetry: false,
			// Browser events are sent same-origin and forwarded to Sentry, so the
			// CSP needs no ingest origin and ad blockers do not drop them.
			tunnelRoute: "/monitoring",
			sourcemaps: {
				disable: !uploadSourceMaps,
				deleteSourcemapsAfterUpload: true,
			},
			widenClientFileUpload: uploadSourceMaps,
		})
	: nextConfig;
