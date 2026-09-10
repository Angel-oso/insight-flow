import { useQuery } from "convex/react";
import type { CSSProperties } from "react";
import { api } from "@/convex/_generated/api";

export type TaxonomyTone =
	| "primary"
	| "info"
	| "success"
	| "warning"
	| "danger"
	| "muted";

export type TaxonomyItem = {
	readonly value: string;
	readonly label: string;
	readonly rank: number;
	readonly tone: TaxonomyTone;
	readonly color?: string;
	readonly isFinal?: boolean;
	readonly chartToken?: string;
	readonly description?: string;
};

export type Taxonomies = {
	readonly statuses: readonly TaxonomyItem[];
	readonly categories: readonly TaxonomyItem[];
	readonly priorities: readonly TaxonomyItem[];
};

/** Badge classes per tone. Kept client-side so Tailwind can see every class. */
export const taxonomyToneBadge: Record<TaxonomyTone, string> = {
	primary: "bg-dashboard-primary-soft text-dashboard-primary",
	info: "bg-dashboard-info-soft text-dashboard-info",
	success: "bg-dashboard-success-soft text-dashboard-success",
	warning: "bg-dashboard-warning-soft text-dashboard-warning-foreground",
	danger: "bg-dashboard-danger-soft text-dashboard-danger",
	muted: "bg-muted text-muted-foreground",
};

/** Chart color per tone for canvas-drawn visualizations. */
export const taxonomyToneChart: Record<TaxonomyTone, string> = {
	primary: "var(--dashboard-primary)",
	info: "var(--dashboard-info)",
	success: "var(--dashboard-success)",
	warning: "var(--dashboard-warning)",
	danger: "var(--dashboard-danger)",
	muted: "var(--muted-foreground)",
};

const mutedFallback: TaxonomyItem = {
	value: "",
	label: "",
	rank: 0,
	tone: "muted",
};

export function taxonomyItemFor(
	items: readonly TaxonomyItem[],
	value: string,
): TaxonomyItem {
	return items.find((item) => item.value === value) ?? { ...mutedFallback, value, label: value };
}

/**
 * Badge look derived from the stored hex color. Works on light and dark
 * surfaces because every layer mixes toward theme tokens.
 */
export function taxonomyColorStyle(color: string): CSSProperties {
	return {
		backgroundColor: `color-mix(in oklch, ${color} 13%, transparent)`,
		color: `color-mix(in oklch, ${color} 72%, var(--foreground))`,
		borderColor: `color-mix(in oklch, ${color} 38%, transparent)`,
	};
}

/** Badge classes when the item has no custom color yet. */
export function taxonomyBadgeClass(item: TaxonomyItem): string {
	return taxonomyToneBadge[item.tone];
}

/** Chart color: custom color first, then the stored token, then the tone. */
export function taxonomyChartColor(item: TaxonomyItem): string {
	return item.color ?? item.chartToken ?? taxonomyToneChart[item.tone];
}

/** Statuses closing the backlog (frontend mirror of the backend rule). */
export function finalStatusValues(taxonomies: Taxonomies): ReadonlySet<string> {
	return new Set(
		taxonomies.statuses
			.filter(
				(item) =>
					item.isFinal ??
					(item.value === "Completed" || item.value === "Discarded"),
			)
			.map((item) => item.value),
	);
}

export function maxPriorityRank(taxonomies: Taxonomies): number {
	return Math.max(0, ...taxonomies.priorities.map((item) => item.rank));
}

export function minStatusRank(taxonomies: Taxonomies): number {
	return Math.min(...taxonomies.statuses.map((item) => item.rank));
}

/** Display taxonomies straight from the database; undefined while loading. */
export function useTaxonomies(): Taxonomies | undefined {
	const docs = useQuery(api.taxonomies.queries.list);
	if (!docs) return undefined;
	const byKey = (key: "status" | "category" | "priority") =>
		docs.find((doc) => doc.key === key)?.items ?? [];
	return {
		statuses: byKey("status"),
		categories: byKey("category"),
		priorities: byKey("priority"),
	};
}
