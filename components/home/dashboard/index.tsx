import type { Project } from "@/lib/projects";
import { ActivityFeed } from "./activity-feed";
import { AttentionQueue } from "./attention-queue";
import { DashboardHeader } from "./dashboard-header";
import { getProjectDashboardData } from "./data";
import { DecisionBrief } from "./decision-brief";
import { MetricSummary } from "./metric-summary";
import { ProjectHealth } from "./project-health";
import { StatusPanel } from "./status-panel";
import { TrendPanel } from "./trend-panel";

export function Dashboard({ project }: { readonly project: Project }) {
	const data = getProjectDashboardData(project);

	return (
		<div className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
			<DashboardHeader project={project} />
			<div className="mt-7 space-y-6">
				<DecisionBrief project={project} criticalItems={data.health.critical} />
				<MetricSummary metrics={data.metrics} />
				<section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
					<TrendPanel rows={data.trendRows} />
					<StatusPanel
						categories={data.categoryItems}
						statuses={data.statusItems}
					/>
				</section>
				<section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
					<AttentionQueue items={data.attentionItems} />
					<ActivityFeed activities={data.activities} />
				</section>
				<ProjectHealth project={data.health} />
			</div>
			<footer className="mt-8 flex flex-col gap-1 border-t pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
				<p>
					Illustrative {project.name} data · Updated May 24, 2026 at 2:18 PM
				</p>
				<p>Health rules: critical items and open backlog</p>
			</footer>
		</div>
	);
}
