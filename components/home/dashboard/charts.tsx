"use client";

import { barX, defineChart, lineY, text } from "@tanstack/charts";
import { focusGroupX } from "@tanstack/charts/focus";
import { pie, polar, radialArc } from "@tanstack/charts/polar";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";

import type {
	DashboardCategoryItem,
	DashboardStatusItem,
	DashboardTrendRow,
} from "./data";

const chartTheme = {
	background: "var(--card)",
	foreground: "var(--foreground)",
	grid: "var(--dashboard-chart-grid)",
	muted: "var(--muted-foreground)",
	palette: [
		"var(--dashboard-primary)",
		"var(--dashboard-success)",
		"var(--dashboard-info)",
		"var(--dashboard-warning)",
		"var(--dashboard-danger)",
	],
} as const;

const visibleTrendDates = [
	"Apr 24",
	"Apr 29",
	"May 4",
	"May 9",
	"May 14",
	"May 19",
	"May 23",
];

function createTrendChart(rows: readonly DashboardTrendRow[]) {
	return defineChart({
		marks: [
			lineY(rows, {
				x: "date",
				y: "received",
				stroke: "var(--dashboard-primary)",
				strokeWidth: 2.5,
				points: true,
			}),
			lineY(rows, {
				x: "date",
				y: "resolved",
				stroke: "var(--dashboard-success)",
				strokeWidth: 2,
				points: true,
			}),
		],
		scales: {
			x: {
				scale: () => scalePoint<string>().padding(0.08),
				axis: {
					ticks: { values: visibleTrendDates, size: 0, padding: 10 },
					tickLabels: { fontSize: 11, thin: { priority: "ends" } },
				},
			},
			y: {
				scale: scaleLinear,
				nice: true,
				grid: true,
				axis: {
					ticks: { count: 5, size: 0, padding: 8 },
					tickLabels: { fontSize: 11 },
				},
			},
		},
		focus: focusGroupX,
		tooltip,
		clip: true,
		theme: chartTheme,
	});
}

function createStatusChart(items: readonly DashboardStatusItem[]) {
	const statusSlices = pie(items, { value: "value", gapAngle: 0.025 });
	return defineChart({
		marks: [
			polar({
				inset: 3,
				radiusRatio: 0.96,
				scales: { angle: null, radius: null },
				marks: [
					radialArc(statusSlices, {
						innerRadius: ({ radius }) => radius * 0.62,
						cornerRadius: 2,
						fill: (slice) => slice.token,
						key: "label",
					}),
				],
			}),
		],
		scales: { x: null, y: null },
		guides: false,
		margin: 0,
		tooltip,
		theme: chartTheme,
	});
}

function createCategoriesChart(items: readonly DashboardCategoryItem[]) {
	const leadingCategories = items.slice(0, 4);
	return defineChart({
		marks: [
			barX(leadingCategories, {
				x: "value",
				y: "label",
				fill: "var(--dashboard-primary)",
				inset: 3,
				maxThickness: 18,
				radius: 4,
			}),
			text(leadingCategories, {
				x: "value",
				y: "label",
				text: "value",
				fill: "var(--foreground)",
				fontSize: 11,
				fontWeight: 600,
				anchor: "start",
				dx: 7,
			}),
		],
		scales: {
			x: {
				scale: scaleLinear,
				nice: true,
				grid: true,
				axis: false,
			},
			y: {
				scale: () => scaleBand<string>().padding(0.2),
				axis: {
					ticks: { size: 0, padding: 8 },
					tickLabels: { fontSize: 11 },
				},
			},
		},
		tooltip,
		clip: false,
		margin: { right: 28 },
		theme: chartTheme,
	});
}

export function FeedbackTrendChart({
	rows,
}: {
	readonly rows: readonly DashboardTrendRow[];
}) {
	const trendChart = createTrendChart(rows);

	return (
		<Chart
			definition={trendChart}
			height={260}
			initialWidth={720}
			ariaLabel="Feedback received and resolved over the last 30 days"
			ariaDescription="Two-line chart comparing daily received feedback with resolved feedback."
			className="w-full"
		/>
	);
}

export function StatusDonutChart({
	items,
	total,
}: {
	readonly items: readonly DashboardStatusItem[];
	readonly total: number;
}) {
	const statusChart = createStatusChart(items);

	return (
		<div className="relative size-[124px] shrink-0">
			<Chart
				definition={statusChart}
				width={124}
				height={124}
				ariaLabel="Feedback status distribution"
				ariaDescription="Donut chart showing feedback grouped by workflow status."
			/>
			<div
				className="pointer-events-none absolute inset-0 grid place-items-center text-center"
				aria-hidden="true"
			>
				<div>
					<p className="font-heading text-xl font-semibold tabular-nums">
						{total}
					</p>
					<p className="text-xs text-muted-foreground">Total</p>
				</div>
			</div>
		</div>
	);
}

export function CategoriesChart({
	items,
}: {
	readonly items: readonly DashboardCategoryItem[];
}) {
	const categoriesChart = createCategoriesChart(items);

	return (
		<Chart
			definition={categoriesChart}
			height={168}
			initialWidth={420}
			ariaLabel="Top feedback categories"
			ariaDescription="Horizontal bar chart ranking the four most frequent feedback categories."
			className="w-full"
		/>
	);
}
