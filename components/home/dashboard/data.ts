import type { Project } from "@/lib/projects";

export const metrics = [
	{
		label: "Feedback received",
		value: "248",
		change: "+12.4%",
		context: "vs. previous period",
		tone: "primary",
	},
	{
		label: "Open feedback",
		value: "62",
		change: "25%",
		context: "of all feedback",
		tone: "info",
	},
	{
		label: "Critical items",
		value: "4",
		change: "2 unassigned",
		context: "requires intervention",
		tone: "danger",
	},
	{
		label: "Resolution rate",
		value: "74%",
		change: "+5.2%",
		context: "vs. previous period",
		tone: "success",
	},
] as const;

export const trendSeries = {
	received: [
		8, 11, 9, 14, 18, 21, 19, 15, 12, 17, 20, 16, 18, 22, 25, 20, 18, 24, 21,
		17, 16, 20, 23, 19, 22, 25, 24, 29, 27, 34,
	],
	resolved: [
		3, 5, 6, 7, 9, 10, 12, 10, 8, 11, 12, 13, 14, 15, 14, 16, 15, 17, 16, 14,
		15, 17, 18, 19, 17, 20, 21, 22, 23, 25,
	],
};

const trendStart = new Date("2026-04-24T00:00:00Z");

export const trendRows = trendSeries.received.map((received, index) => {
	const date = new Date(trendStart);
	date.setUTCDate(trendStart.getUTCDate() + index);

	return {
		date: date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		}),
		received,
		resolved: trendSeries.resolved[index],
	};
});

export const statusItems = [
	{ label: "New", value: 68, token: "var(--dashboard-info)" },
	{ label: "In review", value: 54, token: "var(--dashboard-warning)" },
	{ label: "Planned", value: 32, token: "var(--dashboard-avatar-three)" },
	{ label: "In progress", value: 41, token: "var(--dashboard-primary)" },
	{ label: "Completed", value: 38, token: "var(--dashboard-success)" },
	{ label: "Discarded", value: 15, token: "var(--muted-foreground)" },
] as const;

export const attentionItems = [
	{
		priority: "Critical",
		title: "Login failure on SSO",
		project: "Client Portal",
		reason: "Unassigned",
		age: "3 days",
	},
	{
		priority: "Critical",
		title: "Checkout stalls after payment",
		project: "Mobile App",
		reason: "No activity",
		age: "2 days",
	},
	{
		priority: "High",
		title: "Invite links expire immediately",
		project: "Client Portal",
		reason: "Unassigned",
		age: "5 days",
	},
	{
		priority: "High",
		title: "Course progress not updating",
		project: "Academy",
		reason: "Stale",
		age: "8 days",
	},
] as const;

export const categoryItems = [
	{ label: "Feature request", value: 102 },
	{ label: "Bug", value: 68 },
	{ label: "Improvement", value: 41 },
	{ label: "Question", value: 24 },
	{ label: "Other", value: 13 },
] as const;

export const projects = [
	{
		name: "Client Portal",
		received: 120,
		open: 32,
		critical: 2,
		resolution: "78%",
		activity: "12 min ago",
		health: "At risk",
	},
	{
		name: "Mobile App",
		received: 86,
		open: 18,
		critical: 1,
		resolution: "65%",
		activity: "1 hr ago",
		health: "Needs attention",
	},
	{
		name: "Academy",
		received: 42,
		open: 12,
		critical: 1,
		resolution: "80%",
		activity: "Yesterday",
		health: "Healthy",
	},
] as const;

export const activities = [
	{
		initials: "SJ",
		actor: "Sarah Johnson",
		action: "moved Login failure on SSO to In review",
		project: "Client Portal",
		time: "12 min ago",
		tone: "primary",
	},
	{
		initials: "MC",
		actor: "Michael Chen",
		action: "commented on Data export not working",
		project: "Mobile App",
		time: "46 min ago",
		tone: "neutral",
	},
	{
		initials: "ER",
		actor: "Emma Rodriguez",
		action: "completed Typo in pricing page",
		project: "Academy",
		time: "2 hr ago",
		tone: "success",
	},
	{
		initials: "DS",
		actor: "Daniel Smith",
		action: "raised Bulk invite limit to High priority",
		project: "Client Portal",
		time: "4 hr ago",
		tone: "warning",
	},
] as const;

export type DashboardMetric = (typeof metrics)[number];
export type DashboardTrendRow = (typeof trendRows)[number];
export type DashboardStatusItem = (typeof statusItems)[number];
export type DashboardCategoryItem = (typeof categoryItems)[number];
export type DashboardAttentionItem = (typeof attentionItems)[number];
export type DashboardActivity = (typeof activities)[number];
export type DashboardProjectHealth = {
	readonly name: string;
	readonly received: number;
	readonly open: number;
	readonly critical: number;
	readonly resolution: string;
	readonly activity: string;
	readonly health: "At risk" | "Needs attention" | "Healthy";
};

const dashboardScales: Record<string, number> = {
	"client-portal": 1,
	"mobile-app": 0.72,
	academy: 0.48,
};

function scaleValue(value: number, scale: number) {
	return Math.max(0, Math.round(value * scale));
}

export function getProjectDashboardData(project: Project) {
	const scale = dashboardScales[project.slug] ?? 0;
	const health = projects.find((candidate) => candidate.name === project.name);

	return {
		metrics: metrics.map((metric) => ({
			...metric,
			value:
				metric.label === "Resolution rate"
					? (health?.resolution ?? "—")
					: String(scaleValue(Number(metric.value), scale)),
		})) as readonly DashboardMetric[],
		trendRows: trendRows.map((row) => ({
			...row,
			received: scaleValue(row.received, scale),
			resolved: scaleValue(row.resolved, scale),
		})) as readonly DashboardTrendRow[],
		statusItems: statusItems.map((item) => ({
			...item,
			value: scaleValue(item.value, scale),
		})) as readonly DashboardStatusItem[],
		categoryItems: categoryItems.map((item) => ({
			...item,
			value: scaleValue(item.value, scale),
		})) as readonly DashboardCategoryItem[],
		attentionItems: attentionItems.filter(
			(item) => item.project === project.name,
		) as readonly DashboardAttentionItem[],
		activities: activities.filter(
			(activity) => activity.project === project.name,
		) as readonly DashboardActivity[],
		health:
			health ??
			({
				name: project.name,
				received: 0,
				open: 0,
				critical: 0,
				resolution: "—",
				activity: "No activity yet",
				health: "Healthy",
			} satisfies DashboardProjectHealth),
	};
}
