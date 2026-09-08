import { NavUser } from "@/components/layout/sidebar/nav-user";
import { ProjectSwitcher } from "@/components/layout/sidebar/project-switcher";
import { WorkspaceNavigation } from "@/components/layout/sidebar/workspace-navigation";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarRail,
	SidebarSeparator,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import type { Project } from "@/lib/projects";

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
			</SidebarContent>

			<SidebarFooter>
				<NavUser />
				<SidebarSeparator className="mx-0 w-full" />
				<SidebarTrigger
					aria-label="Toggle navigation menu"
					label="Collapse sidebar"
					title="Toggle navigation menu"
					className="hidden w-full justify-start gap-2 px-2 md:flex md:group-data-[collapsible=icon]:size-8 md:group-data-[collapsible=icon]:justify-center"
				/>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
