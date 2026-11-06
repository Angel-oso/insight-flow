/** MVP health is transparent: 20+ open items is a clearly high backlog. */
export const HIGH_OPEN_BACKLOG = 20;

/**
 * One health rule for the project and organization overviews (PRODUCT.md):
 * at risk with any open item at the taxonomy's top priority or a clearly high
 * backlog; needs attention with any open backlog; otherwise healthy.
 * Inputs are aggregate counts (see convex/feedback/aggregates.ts):
 * `critical` = open items whose priority has the taxonomy's top rank.
 */
export function projectHealth({ open, critical }: { open: number; critical: number }) {
	const status =
		critical > 0 || open >= HIGH_OPEN_BACKLOG
			? ("At risk" as const)
			: open > 0
				? ("Needs attention" as const)
				: ("Healthy" as const);
	return { open, critical, status };
}
