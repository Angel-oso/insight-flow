"use client";

import type { Project } from "@/lib/projects";
import { ActivityFeed } from "./activity-feed";
import { AttentionQueue } from "./attention-queue";
import { DashboardHeader } from "./dashboard-header";
import { DecisionBrief } from "./decision-brief";
import { MetricSummary } from "./metric-summary";
import { StatusPanel } from "./status-panel";
import { TrendPanel } from "./trend-panel";
import { parseAsNumberLiteral, useQueryState } from "nuqs";
import {
	OVERVIEW_RANGES,
	type OverviewRange,
	useProjectOverview,
} from "./use-overview";

export function Dashboard({ project }: { readonly project: Project }) {
	const [rangeDays, setRangeDays] = useQueryState(
		"range",
		parseAsNumberLiteral(OVERVIEW_RANGES).withDefault(30),
	);
	const overview = useProjectOverview(project.slug, rangeDays);
	const header = (
		<DashboardHeader
			project={project}
			rangeDays={rangeDays}
			onRangeChange={(range: OverviewRange) => void setRangeDays(range)}
		/>
	);

	if (!overview) {
		return (
			<div className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
				{header}
				<p role="status" className="mt-7 text-muted-foreground">
					Loading overview…
				</p>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
			{header}
			<div className="mt-7 space-y-6">
				<DecisionBrief project={project} criticalItems={overview.health.critical} laneLabel={overview.criticalLabel} />
				<MetricSummary metrics={overview.metrics} health={overview.health} />
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
