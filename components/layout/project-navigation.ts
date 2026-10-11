import { Inbox, LayoutDashboard, Settings, Users } from "lucide-react";

export const projectNavigation = [
	{ label: "Overview", icon: LayoutDashboard, section: "home" },
	{ label: "Feedback", icon: Inbox, section: "feedback" },
	{ label: "Team", icon: Users, section: "team" },
	{ label: "Project settings", icon: Settings, section: "settings" },
] as const;

export function isProjectSectionActive(pathname: string | null, href: string) {
	return pathname === href || pathname?.startsWith(`${href}/`) === true;
}
