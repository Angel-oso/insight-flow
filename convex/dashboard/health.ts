import type { Doc } from "../_generated/dataModel";

/** MVP health is transparent: 20+ open items is a clearly high backlog. */
export const HIGH_OPEN_BACKLOG = 20;

/**
 * One health rule for the project and organization overviews (PRODUCT.md):
 * at risk with any open item at the taxonomy's top priority or a clearly high
 * backlog; needs attention with any open backlog; otherwise healthy.
 */
export function projectHealth(
	items: readonly Doc<"feedback">[],
	finals: ReadonlySet<string>,
	priorityRanks: ReadonlyMap<string, number>,
) {
	const topRank = Math.max(0, ...priorityRanks.values());
	const openItems = items.filter((item) => !finals.has(item.status));
	const critical = openItems.filter((item) => priorityRanks.get(item.priority) === topRank).length;
	const open = openItems.length;
	const status =
		critical > 0 || open >= HIGH_OPEN_BACKLOG
			? ("At risk" as const)
			: open > 0
				? ("Needs attention" as const)
				: ("Healthy" as const);
	return { open, critical, status };
}
