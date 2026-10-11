"use client";

import type { Project } from "@/lib/projects";
import { ActivityFeed } from "./activity-feed";
import { AttentionQueue } from "./attention-queue";
import { DashboardHeader } from "./dashboard-header";
import { DecisionBrief } from "./decision-brief";
import { MetricSummary } from "./metric-summary";
import { StatusPanel } from "./status-panel";
import { TrendPanel } from "./trend-panel";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { OVERVIEW_RANGES } from "./date-window";
import { useProjectOverview } from "./use-overview";
import { MyWork } from "./my-work";
import { WorkloadPanel } from "./workload-panel";

export function Dashboard({ project }: { readonly project: Project }) {
	const [dates, setDates] = useQueryStates({
		range: parseAsStringLiteral(OVERVIEW_RANGES).withDefault("30"),
		from: parseAsString.withDefault(""),
		to: parseAsString.withDefault(""),
	}, { clearOnDefault: false });
	const { overview, rangeLabel, today, defaultFrom, error } = useProjectOverview(project.slug, dates.range, dates.from, dates.to);
	const header = (
		<DashboardHeader
			project={project}
			range={dates.range}
			rangeLabel={rangeLabel}
			fromDate={dates.from || defaultFrom}
			toDate={dates.to || today}
			today={today}
			onRangeChange={(range) => void setDates({ range, from: null, to: null })}
			onCustomChange={(from, to) => void setDates({ range: "custom", from, to })}
			canManageProject={overview?.viewer.permissions.includes("project.manage") ?? false}
		/>
	);

	if (!overview) {
		return (
			<div className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
				{header}
				<p role={error ? "alert" : "status"} className="mt-7 text-muted-foreground">
					{error ?? "Loading overview…"}
				</p>
			</div>
		);
	}

	const personalFirst = !overview.viewer.permissions.includes("feedback.triage");
	const myWork = <MyWork mine={overview.mine} taxonomies={overview.taxonomies} projectSlug={project.slug} rangeLabel={rangeLabel} />;
	return (
		<div className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
			{header}
			<div className="mt-7 space-y-6">
				{personalFirst && myWork}
				<DecisionBrief project={project} criticalItems={overview.health.critical} laneLabel={overview.criticalLabel} />
				<MetricSummary metrics={overview.metrics} health={overview.health} />
				{(!personalFirst || overview.workload !== null) && (
					<section className={`grid gap-6 ${!personalFirst && overview.workload !== null ? "xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]" : ""}`}>
						{!personalFirst && myWork}
						{overview.workload !== null && <WorkloadPanel rows={overview.workload} />}
					</section>
				)}
				<section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
					<TrendPanel
						rows={overview.trendRows}
						ticks={overview.trendTicks}
						pace={overview.pace}
					/>
					<StatusPanel
						categories={overview.categories}
						statuses={overview.statuses}
					/>
				</section>
				<section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
					<AttentionQueue
						items={overview.attention}
						projectSlug={project.slug}
					/>
					<ActivityFeed activities={overview.activities} />
				</section>
			</div>
			<footer className="mt-8 border-t pt-5 text-xs text-muted-foreground">
				<p>
					Live {project.name} data · Updated {overview.footerUpdated}
				</p>
			</footer>
		</div>
	);
}
