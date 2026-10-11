import { LogoMark } from "@/components/brand/logo";
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
					<LogoMark className="size-6" />
					<span
						className="truncate text-sm font-semibold text-foreground"
						title={project?.name ?? "InsightFlow"}
					>
						{project?.name ?? "InsightFlow"}
					</span>
				</div>
			</header>
			{/* Mobile navigation lives in the sidebar sheet opened from this header. */}
			<SidebarInset className="min-w-0 bg-dashboard-canvas pt-[calc(3.5rem+env(safe-area-inset-top)+1px)] pb-[env(safe-area-inset-bottom)] md:pt-0 md:pb-0">
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}
