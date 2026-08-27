import { AppSidebar } from "@/components/layout/sidebar/app-sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import type { Project } from "@/lib/projects";

export function AppShell({
	children,
	project,
}: {
	readonly children: React.ReactNode;
	readonly project: Project;
}) {
	return (
		<SidebarProvider>
			<AppSidebar project={project} />
			<SidebarTrigger className="fixed top-2 left-4 z-20 md:left-[calc(var(--sidebar-width)+0.25rem)] md:peer-data-[state=collapsed]:left-[calc(var(--sidebar-width-icon)+0.25rem)]" />
			<SidebarInset className="min-w-0 bg-dashboard-canvas">
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}
