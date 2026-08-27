import { Settings } from "lucide-react";
import Link from "next/link";

import { NavUser } from "@/components/layout/sidebar/nav-user";
import { ProjectSwitcher } from "@/components/layout/sidebar/project-switcher";
import { WorkspaceNavigation } from "@/components/layout/sidebar/workspace-navigation";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import type { Project } from "@/lib/projects";
import { projectPath } from "@/lib/projects";

export function AppSidebar({
	project,
	...props
}: React.ComponentProps<typeof Sidebar> & { readonly project: Project }) {
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<ProjectSwitcher project={project} />
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				<WorkspaceNavigation projectSlug={project.slug} />

				<SidebarGroup className="mt-auto">
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									tooltip="Project settings"
									render={<Link href={projectPath(project.slug, "settings")} />}
								>
									<Settings />
									<span>Project settings</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
