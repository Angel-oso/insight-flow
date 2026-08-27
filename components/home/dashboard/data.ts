import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Inbox, MessageSquare, TrendingUp } from "lucide-react";

export type Metric = {
	label: string;
	value: string;
	detail: string;
	icon: LucideIcon;
	iconClassName: string;
	detailClassName: string;
};

export const metrics: Metric[] = [
	{
		label: "Feedback received",
		value: "248",
		detail: "+12.4% from last period",
		icon: MessageSquare,
		iconClassName: "bg-dashboard-primary-soft text-dashboard-primary",
		detailClassName: "text-dashboard-success",
	},
	{
		label: "Open feedback",
		value: "62",
		detail: "18 require review",
		icon: Inbox,
		iconClassName: "bg-dashboard-info-soft text-dashboard-info",
		detailClassName: "text-dashboard-info",
	},
	{
		label: "Critical items",
		value: "4",
		detail: "Needs attention",
		icon: AlertTriangle,
		iconClassName: "bg-dashboard-danger-soft text-dashboard-danger",
		detailClassName: "text-dashboard-danger",
	},
	{
		label: "Resolution rate",
		value: "74%",
		detail: "+5.2% from last period",
		icon: TrendingUp,
		iconClassName: "bg-dashboard-success-soft text-dashboard-success",
		detailClassName: "text-dashboard-success",
	},
];

export const trendValues = [
	8, 13, 9, 14, 19, 23, 21, 17, 13, 10, 16, 21, 14, 16, 21, 24, 27, 20, 18, 27,
	22, 17, 14, 16, 21, 24, 17, 17, 22, 26, 25, 34, 29, 36,
];

export const statusItems = [
	{ label: "New", value: 68, color: "var(--dashboard-info)" },
	{ label: "In review", value: 54, color: "var(--dashboard-warning)" },
	{ label: "Planned", value: 32, color: "var(--dashboard-avatar-three)" },
	{ label: "In progress", value: 41, color: "var(--dashboard-primary)" },
	{ label: "Completed", value: 38, color: "var(--dashboard-success)" },
	{ label: "Discarded", value: 15, color: "var(--dashboard-danger)" },
];

export const attentionItems: {
	priority: "Critical" | "High" | "Medium";
	title: string;
	project: string;
	date: string;
}[] = [
	{
		priority: "Critical",
		title: "Login failure on SSO",
		project: "Client Portal",
		date: "May 24",
	},
	{
		priority: "High",
		title: "Data export not working",
		project: "Mobile App",
		date: "May 22",
	},
	{
		priority: "Medium",
		title: "Dark mode option",
		project: "Academy",
		date: "May 20",
	},
	{
		priority: "Medium",
		title: "Bulk invites error",
		project: "Client Portal",
		date: "May 18",
	},
];

export const categories = [
	{ label: "Feature request", value: 102 },
	{ label: "Bug", value: 68 },
	{ label: "Improvement", value: 41 },
	{ label: "Question", value: 24 },
	{ label: "Other", value: 13 },
];

export const projects = [
	{
		name: "Client Portal",
		received: 120,
		open: 32,
		critical: 2,
		resolution: "78%",
		change: "+6.1%",
		activity: "May 24, 2:18 PM",
		health: "Good",
	},
	{
		name: "Mobile App",
		received: 86,
		open: 18,
		critical: 1,
		resolution: "65%",
		change: "-2.3%",
		activity: "May 24, 11:07 AM",
		health: "Fair",
	},
	{
		name: "Academy",
		received: 42,
		open: 12,
		critical: 1,
		resolution: "80%",
		change: "+9.4%",
		activity: "May 23, 4:35 PM",
		health: "Good",
	},
];

export const activities = [
	{
		initials: "SJ",
		color: "bg-dashboard-avatar-one",
		name: "Sarah Johnson",
		action: 'marked feedback "Login failure on SSO"',
		project: "Client Portal",
		date: "May 24, 2:18 PM",
		status: "In review",
	},
	{
		initials: "MJ",
		color: "bg-dashboard-avatar-two",
		name: "Michael Chen",
		action: 'added a comment on "Export to CSV"',
		project: "Mobile App",
		date: "May 24, 11:02 AM",
	},
	{
		initials: "ER",
		color: "bg-dashboard-avatar-three",
		name: "Emma Rodriguez",
		action: 'resolved "Typo in pricing page"',
		project: "Academy",
		date: "May 23, 4:35 PM",
		status: "Completed",
	},
	{
		initials: "DS",
		color: "bg-dashboard-avatar-four",
		name: "Daniel Smith",
		action: 'created feedback "Bulk invite limit"',
		project: "Client Portal",
		date: "May 23, 9:41 AM",
	},
];
