/**
 * Every company-specific value used by /privacy and /terms, in one place.
 * InsightFlow is a demo project, so these are neutral sample values and the
 * legal pages say so (DEMO_NOTICE). For a real launch, set DEMO_NOTICE to
 * false, replace the values, and have the text reviewed by counsel.
 */
export const DEMO_NOTICE = true;

export const LEGAL = {
	effectiveDate: "1 November 2026",
	companyName: "InsightFlow (demo project)",
	postalAddress: "no postal address (demo project)",
	contactEmail: "privacy@example.com",
	webHost: "Vercel",
	/** Sentence naming data regions, or "" to omit it. */
	dataRegions: "",
	/** Days to honor deletion requests and delete data after termination. */
	deletionDays: "30",
	backupRetention: "30 days",
	/** Sentry event retention in days. */
	errorReportDays: "90",
	/** Liability cap: months of fees and the fallback amount. */
	liabilityMonths: "12",
	liabilityAmount: "USD 0",
	fees: "The Service is provided free of charge as a demonstration.",
	jurisdiction: "Spain",
	venue: "Madrid",
} as const;
