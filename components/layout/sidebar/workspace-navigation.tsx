"use client";

import { Inbox, LayoutDashboard, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { projectPath } from "@/lib/projects";

const navigation = [
	{ label: "Overview", icon: LayoutDashboard, section: "home" },
	{ label: "Feedback", icon: Inbox, section: "feedback" },
	{ label: "Team", icon: Users, section: "team" },
] as const;

export function WorkspaceNavigation({
	projectSlug,
}: {
	readonly projectSlug: string;
}) {
	const pathname = usePathname();

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Workspace</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					{navigation.map((item) => {
						const href = projectPath(projectSlug, item.section);
						const isActive = href === pathname;

						return (
							<SidebarMenuItem key={item.label}>
								<SidebarMenuButton
									isActive={isActive}
									tooltip={item.label}
									render={
										<Link
											href={href}
											aria-current={isActive ? "page" : undefined}
										/>
									}
								>
									<item.icon />
									<span>{item.label}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						);
					})}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
