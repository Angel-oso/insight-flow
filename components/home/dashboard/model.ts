import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { taxonomyToneChart, type TaxonomyTone } from "@/lib/taxonomy";

export type OverviewQueryData = FunctionReturnType<typeof api.overview.get>;

export type OverviewMetricTone = "primary" | "info" | "danger" | "success";

export type OverviewMetric = {
	readonly label: string;
	readonly value: string;
	readonly change: string;
	readonly context: string;
	readonly tone: OverviewMetricTone;
	readonly color?: string;
};

export type OverviewTrendRow = {
	readonly date: string;
	readonly received: number;
	readonly resolved: number;
};

export type OverviewStatusItem = {
	readonly label: string;
	readonly value: number;
	readonly token: string;
};

export type OverviewCategoryItem = {
	readonly label: string;
	readonly value: number;
};

export type OverviewAttentionItem = {
	readonly id: Id<"feedback">;
	readonly title: string;
	readonly project: string;
	readonly priority: string;
	readonly priorityLabel: string;
	readonly tone: TaxonomyTone;
	readonly color?: string;
	readonly reason: "Unassigned" | "Stale" | "No activity";
	readonly age: string;
};

export type OverviewActivityTone = "primary" | "neutral" | "success" | "warning";

export type OverviewActivity = {
	readonly id: Id<"activities">;
	readonly actor: string;
	readonly initials: string;
	readonly action: string;
	readonly project: string;
	readonly time: string;
	readonly tone: OverviewActivityTone;
};

export type OverviewHealth = {
	readonly name: string;
	readonly received: number;
	readonly open: number;
	readonly critical: number;
	readonly resolution: string;
	readonly activity: string;
	readonly health: "At risk" | "Needs attention" | "Healthy";
};

export type PresentedOverview = {
	readonly metrics: readonly OverviewMetric[];
	readonly trendRows: readonly OverviewTrendRow[];
	readonly trendTicks: readonly string[];
	readonly pace: string | null;
	readonly criticalLabel: string;
	readonly statuses: readonly OverviewStatusItem[];
	readonly categories: readonly OverviewCategoryItem[];
	readonly attention: readonly OverviewAttentionItem[];
	readonly activities: readonly OverviewActivity[];
	readonly health: OverviewHealth;
	readonly footerUpdated: string;
};

function relativeTime(timestamp: number, now: number) {
	const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes} min ago`;
	if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
	return `${Math.floor(minutes / 1440)} days ago`;
}

function percentChange(current: number, previous: number) {
	if (previous <= 0) return null;
	return ((current - previous) / previous) * 100;
}

function signed(value: number, digits: number, unit: string) {
	const sign = value > 0 ? "+" : value < 0 ? "−" : "";
	return `${sign}${Math.abs(value).toFixed(digits)}${unit}`;
}

/** Presentation boundary: counts and timestamps become dashboard copy. */
export function presentOverview(
	data: OverviewQueryData,
	projectName: string,
	now: number,
): PresentedOverview {
	const { metrics, health, taxonomies } = data;

	const statusByValue = new Map(taxonomies.statuses.map((item) => [item.value, item]));
	const priorityByValue = new Map(
		taxonomies.priorities.map((item) => [item.value, item]),
	);
	const categoryByValue = new Map(
		taxonomies.categories.map((item) => [item.value, item]),
	);
	const criticalLabel = metrics.criticalLabel ?? "Critical";

	const receivedDelta = percentChange(metrics.received, metrics.receivedPrevious);
	const currentRate =
		metrics.received > 0 ? metrics.completedInRange / metrics.received : null;
	const previousRate =
		metrics.receivedPrevious > 0
			? metrics.completedPrevious / metrics.receivedPrevious
			: null;
	const rateDeltaPts =
		currentRate !== null && previousRate !== null
			? (currentRate - previousRate) * 100
			: null;

	const presentedMetrics: readonly OverviewMetric[] = [
		{
			label: "Feedback received",
			value: String(metrics.received),
			change: receivedDelta === null ? "—" : signed(receivedDelta, 1, "%"),
			context: "vs. previous period",
			tone: "primary",
		},
		{
			label: "Open feedback",
			value: String(metrics.open),
			change:
				metrics.total > 0
					? `${Math.round((metrics.open / metrics.total) * 100)}%`
					: "0%",
			context: "of all feedback",
			tone: "info",
		},
		{
			label: `${criticalLabel} items`,
			value: String(metrics.critical),
			change: `${metrics.criticalUnassigned} unassigned`,
			context: "requires intervention",
			tone: "danger",
			...(metrics.criticalColor ? { color: metrics.criticalColor } : {}),
		},
		{
			label: "Resolution rate",
			value: currentRate === null ? "—" : `${Math.round(currentRate * 100)}%`,
			change: rateDeltaPts === null ? "—" : signed(rateDeltaPts, 1, " pts"),
			context: "vs. previous period",
			tone: "success",
		},
	];

	const trendRows = data.trend.map((row) => ({
		date: new Date(row.dayStart).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		}),
		received: row.received,
		resolved: row.resolved,
	}));
	const tickStep = Math.max(1, Math.ceil(trendRows.length / 6));
	const trendTicks = trendRows
		.filter((_, index) => index % tickStep === 0)
		.map((row) => row.date);

	const pace =
		rateDeltaPts === null || Math.abs(rateDeltaPts) < 0.05
			? null
			: rateDeltaPts > 0
				? `Resolution pace improved ${signed(rateDeltaPts, 1, " pts")}`
				: `Resolution pace slowed ${signed(rateDeltaPts, 1, " pts")}`;

	return {
		metrics: presentedMetrics,
		trendRows,
		trendTicks,
		pace,
		criticalLabel,
		statuses: data.statuses.map((item) => {
			const taxonomy = statusByValue.get(item.status);
			return {
				label: taxonomy?.label ?? item.status,
				value: item.count,
				token:
					taxonomy?.color ??
					taxonomy?.chartToken ??
					taxonomyToneChart[taxonomy?.tone ?? "muted"],
			};
		}),
		categories: data.categories.map((item) => ({
			label: categoryByValue.get(item.category)?.label ?? item.category,
			value: item.count,
		})),
		attention: data.attention.map((item) => {
			const taxonomy = priorityByValue.get(item.priority);
			return {
				id: item.id,
				title: item.title,
				project: projectName,
				priority: item.priority,
				priorityLabel: taxonomy?.label ?? item.priority,
				tone: taxonomy?.tone ?? ("muted" as const),
				color: taxonomy?.color,
				reason: item.reason,
				age: relativeTime(item.updatedAt, now),
			};
		}),
		activities: data.activities.map((activity) => ({
			id: activity.id,
			actor: activity.actor,
			initials: activity.initials,
			action: activity.action,
			project: projectName,
			time: relativeTime(activity.createdAt, now),
			tone: activity.tone,
		})),
		health: {
			name: data.project.name,
			received: health.received,
			open: health.open,
			critical: health.critical,
			resolution:
				health.total > 0
					? `${Math.round((health.completed / health.total) * 100)}%`
					: "—",
			activity:
				health.lastActivityAt === null
					? "No activity yet"
					: relativeTime(health.lastActivityAt, now),
			health: health.status,
		},
		footerUpdated: relativeTime(data.generatedAt, now),
	};
}
