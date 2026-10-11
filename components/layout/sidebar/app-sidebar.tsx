import { NavUser } from "@/components/layout/sidebar/nav-user";
import { OrganizationNavigation } from "@/components/layout/sidebar/organization-navigation";
import { ProjectSwitcher } from "@/components/layout/sidebar/project-switcher";
import { SidebarBrand } from "@/components/layout/sidebar/sidebar-brand";
import { WorkspaceNavigation } from "@/components/layout/sidebar/workspace-navigation";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarRail,
	SidebarSeparator,
} from "@/components/ui/sidebar";
import type { Project } from "@/lib/projects";

/**
 * Three tiers, top to bottom: the product, the organization, the current
 * project (its switcher sits directly above the sections it controls), and
 * the signed-in person at the foot.
 */
export function AppSidebar({
	project,
	...props
}: React.ComponentProps<typeof Sidebar> & { readonly project?: Project }) {
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader className="border-b border-sidebar-border px-3 py-3 group-data-[collapsible=icon]:px-2">
				<SidebarBrand />
			</SidebarHeader>

			<SidebarContent className="gap-1 py-2">
				<OrganizationNavigation projectSlug={project?.slug} />
				{/* Group labels vanish on the collapsed rail; a rule keeps the tiers apart. */}
				<SidebarSeparator className="mx-auto hidden w-6! bg-sidebar-foreground/20 group-data-[collapsible=icon]:block" />
				<SidebarGroup>
					<SidebarGroupLabel>Project</SidebarGroupLabel>
					<SidebarGroupContent className="space-y-1">
						<SidebarMenu>
							<ProjectSwitcher project={project} />
						</SidebarMenu>
						{project ? <WorkspaceNavigation projectSlug={project.slug} /> : null}
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter className="border-t border-sidebar-border">
				<NavUser />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
