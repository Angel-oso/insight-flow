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
			<SidebarTrigger
				aria-label="Open navigation menu"
				title="Open navigation menu"
				className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-[max(0.75rem,env(safe-area-inset-left))] z-40 size-11 rounded-xl border border-border bg-background text-foreground shadow-sm hover:bg-muted focus-visible:ring-3 md:hidden"
			/>
			<SidebarInset className="min-w-0 bg-dashboard-canvas pt-[max(3rem,calc(env(safe-area-inset-top)+3rem))] md:pt-0">
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}
