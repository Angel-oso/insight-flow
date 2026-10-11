"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
	isProjectSectionActive,
	projectNavigation,
} from "@/components/layout/project-navigation";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { projectPath } from "@/lib/projects";

export function WorkspaceNavigation({
	projectSlug,
}: {
	readonly projectSlug: string;
}) {
	const pathname = usePathname();

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Project</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					{projectNavigation.map((item) => {
						const href = projectPath(projectSlug, item.section);
						const isActive = isProjectSectionActive(pathname, href);

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
