import { MobileProjectNavigation } from "@/components/layout/mobile-project-navigation";
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import type { Project } from "@/lib/projects";
import { cn } from "@/lib/utils";

export function AppShell({
	children,
	project,
}: {
	readonly children: React.ReactNode;
	readonly project?: Project;
}) {
	return (
		<SidebarProvider>
			<AppSidebar project={project} />
			<header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background pt-[env(safe-area-inset-top)] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] md:hidden">
				<div className="flex h-14 items-center gap-2">
					<SidebarTrigger
						aria-label="Open navigation menu"
						title="Open navigation menu"
						className="size-11 shrink-0 rounded-lg text-foreground hover:bg-muted focus-visible:ring-3"
					/>
					<span
						className="truncate text-sm font-semibold text-foreground"
						title={project?.name ?? "InsightFlow"}
					>
						{project?.name ?? "InsightFlow"}
					</span>
				</div>
			</header>
			<SidebarInset
				className={cn(
					"min-w-0 bg-dashboard-canvas pt-[calc(3.5rem+env(safe-area-inset-top)+1px)] md:pt-0 md:pb-0",
					project && "pb-[calc(5rem+env(safe-area-inset-bottom))]",
				)}
			>
				{children}
			</SidebarInset>
			{project ? (
				<MobileProjectNavigation projectSlug={project.slug} />
			) : null}
		</SidebarProvider>
	);
}
