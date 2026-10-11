import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { ActivityFeed } from "@/components/home/dashboard/activity-feed";
import { MetricSummary } from "@/components/home/dashboard/metric-summary";
import { presentPeriodMetrics, relativeTime, type OverviewMetric } from "@/components/home/dashboard/model";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { projectPath } from "@/lib/projects";

type Overview = FunctionReturnType<typeof api.organizations.queries.overview>;
type Admin = NonNullable<Overview["admin"]>;
const healthStyles = {
	"At risk": "bg-dashboard-danger-soft text-dashboard-danger",
	"Needs attention": "bg-dashboard-warning-soft text-dashboard-warning-foreground",
	Healthy: "bg-dashboard-success-soft text-dashboard-success",
};

function HealthBadge({ health }: { readonly health: keyof typeof healthStyles }) {
	return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ${healthStyles[health]}`}>{health}</span>;
}

export function AdminOverview({ admin, projects, now }: { readonly admin: Admin; readonly projects: Overview["projects"]; readonly now: number }) {
	const { metrics, health } = admin;
	const period = presentPeriodMetrics(metrics);
	// Health box: all-time resolved / all feedback, like the project health box.
	const resolved = health.reduce((sum, project) => sum + project.completed, 0);
	const resolution = metrics.total ? `${Math.round((resolved / metrics.total) * 100)}%` : "—";
	const presentedMetrics: OverviewMetric[] = [
		{ label: "Feedback received", value: String(metrics.received), change: period.receivedChange, context: "vs. previous period", tone: "primary" },
		{ label: "Open feedback", value: String(metrics.open), change: "Current backlog", context: "across all projects", tone: "info" },
		{ label: "Critical items", value: String(metrics.critical), change: "Top priority", context: "open items requiring intervention", tone: "danger" },
		{ label: "Resolution rate", value: period.resolutionRate, change: period.resolutionChange, context: "vs. previous period", tone: "success" },
	];
	const overallHealth = health.some((project) => project.health === "At risk") ? "At risk" : metrics.open > 0 ? "Needs attention" : "Healthy";
	const latestActivityAt = Math.max(0, ...health.map((project) => project.latestActivityAt));
	const visibleSlugs = new Set(projects.map((project) => project.slug));
	const atRisk = health.filter((project) => project.health === "At risk");
	return <>
		<section className="rounded-xl bg-foreground px-5 py-6 text-background sm:px-6" aria-label="Organization health brief">
			<h2 className="font-heading text-xl font-semibold tracking-[-0.025em]">{atRisk.length ? `${atRisk.length} ${atRisk.length === 1 ? "project needs" : "projects need"} intervention` : metrics.open ? "Keep the backlog moving" : "A clear starting point"}</h2>
			<p className="mt-2 max-w-[65ch] text-sm leading-6 text-background/70">{atRisk.length ? `${metrics.critical} critical open items and ${metrics.open} open feedback across the organization. Review the highest-backlog projects below.` : metrics.open ? `${metrics.open} open items, with no critical items or high-backlog projects. Review project health to keep work moving.` : "No open feedback right now. Create a project or share a project's feedback link to begin collecting evidence."}</p>
		</section>
		<MetricSummary metrics={presentedMetrics} health={{ name: "Organization", received: metrics.received, open: metrics.open, critical: metrics.critical, resolution, activity: latestActivityAt ? relativeTime(latestActivityAt, now) : "No activity yet", health: overallHealth }} />
		<Card className="gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="border-b px-5 py-5 sm:px-6"><h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">Project health</h2><p className="text-sm text-muted-foreground">Ranked by open feedback. Received counts use the selected period; resolution is resolved (any final status) / all feedback.</p></CardHeader>
			<CardContent className="p-0">
				<div className="hidden overflow-x-auto md:block">
					<table className="w-full text-left text-sm">
						<caption className="sr-only">Organization project health, ordered by open feedback</caption>
						<thead className="border-b bg-muted/30 text-xs text-muted-foreground"><tr>{["Project", "Received", "Open", "Critical", "Resolution", "Latest activity", "Health"].map((label) => <th key={label} scope="col" className="px-5 py-3 font-medium">{label}</th>)}</tr></thead>
						<tbody className="divide-y">{health.map((project) => <tr key={project.slug}>
							<th scope="row" className="px-5 py-4 font-medium">{visibleSlugs.has(project.slug) ? <Link href={projectPath(project.slug, "home")} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary">{project.name}</Link> : project.name}</th>
							<td className="px-5 py-4 tabular-nums">{project.received}</td><td className="px-5 py-4 tabular-nums">{project.open}</td><td className="px-5 py-4 tabular-nums">{project.critical}</td><td className="px-5 py-4 tabular-nums">{project.total ? `${Math.round(project.resolutionRate * 100)}%` : "—"}</td><td className="px-5 py-4 text-xs text-muted-foreground">{relativeTime(project.latestActivityAt, now)}</td><td className="px-5 py-4"><HealthBadge health={project.health} /></td>
						</tr>)}</tbody>
					</table>
				</div>
				<ul className="divide-y md:hidden">{health.map((project) => <li key={project.slug} className="space-y-4 px-5 py-5">
					<div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{visibleSlugs.has(project.slug) ? <Link href={projectPath(project.slug, "home")} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary">{project.name}</Link> : project.name}</h3><HealthBadge health={project.health} /></div>
					<dl className="grid grid-cols-2 gap-4">{[["Received", project.received], ["Open", project.open], ["Critical", project.critical], ["Resolution", project.total ? `${Math.round(project.resolutionRate * 100)}%` : "—"]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}</dl>
					<p className="text-xs text-muted-foreground">Latest activity {relativeTime(project.latestActivityAt, now)}</p>
				</li>)}</ul>
				{health.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">No projects yet. Create one to start collecting feedback.</p>}
			</CardContent>
			<p className="border-t px-5 py-3 text-xs leading-5 text-muted-foreground">At risk: any critical open item or 20+ open items. Needs attention: 1–19 open items without critical items. Healthy: no open items.</p>
		</Card>
		<ActivityFeed activities={admin.activities.map((activity) => ({ id: activity.id, feedbackId: activity.feedbackId, projectSlug: visibleSlugs.has(activity.projectSlug) ? activity.projectSlug : undefined, actor: activity.actor, initials: activity.actor.split(/\s+/).map((part) => part[0]).slice(0, 2).join(""), action: activity.message, project: activity.projectName, time: relativeTime(activity.createdAt, now), tone: activity.type === "project_created" ? "primary" : "neutral" }))} />
	</>;
}
