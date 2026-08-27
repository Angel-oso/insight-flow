import { AttentionRequired } from "./attention-required";
import { metrics } from "./data";
import { FeedbackTrend } from "./feedback-trend";
import { MetricCard } from "./metric-card";
import { ProjectHealth } from "./project-health";
import { RecentActivity } from "./recent-activity";
import { StatusDistribution } from "./status-distribution";
import { TopCategories } from "./top-categories";

export function Dashboard() {
	return (
		<div className="min-h-full bg-dashboard-canvas p-4 sm:p-6 lg:p-7">
			<div className="mx-auto grid max-w-[1440px] gap-4">
				<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					{metrics.map((metric) => (
						<MetricCard key={metric.label} metric={metric} />
					))}
				</section>
				<section className="grid gap-4 lg:grid-cols-2">
					<FeedbackTrend />
					<StatusDistribution />
				</section>
				<section className="grid gap-4 lg:grid-cols-2">
					<AttentionRequired />
					<TopCategories />
				</section>
				<section className="grid gap-4 lg:grid-cols-[1.42fr_0.98fr]">
					<ProjectHealth />
					<RecentActivity />
				</section>
			</div>
		</div>
	);
}
