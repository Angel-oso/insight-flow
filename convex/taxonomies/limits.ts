/**
 * Most options per taxonomy. Shared by the server (createOption) and the
 * settings UI, so this module must stay free of server imports.
 *
 * Why these numbers: metric readers multiply taxonomies. The project
 * overview reads two bounded buckets per open status × priority (plus one
 * personal bucket) and the backlog counts every open status × priority pair
 * per project (the organization overview does that for up to 50 projects).
 * With 10 statuses × 6 priorities the worst case is 60 pairs: ~180 bucket
 * reads (≤1,680 rows) on the project overview and ≤71 aggregate counts per
 * project backlog (≤3,550 for 50 projects), inside Convex's per-transaction
 * read limits. Categories are only counted one by one, so they get more room.
 */
export const TAXONOMY_OPTION_LIMITS = {
	status: 10,
	priority: 6,
	category: 20,
} as const;
