import { useQuery } from "convex/react";
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

/** Display taxonomies straight from the database; undefined while loading. */
export function useTaxonomies(): Taxonomies | undefined {
	const docs = useQuery(api.taxonomies.list);
	if (!docs) return undefined;
	const byKey = (key: "status" | "category" | "priority") =>
		docs.find((doc) => doc.key === key)?.items ?? [];
	return {
		statuses: byKey("status"),
		categories: byKey("category"),
		priorities: byKey("priority"),
	};
}
