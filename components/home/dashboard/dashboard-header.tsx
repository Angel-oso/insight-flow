import {
	CalendarDays,
	ChevronDown,
	Inbox,
	LayoutDashboard,
	Plus,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { type Project, projectPath } from "@/lib/projects";

export function DashboardHeader({ project }: { readonly project: Project }) {
	return (
		<header className="flex flex-col gap-6 border-b pb-7 xl:flex-row xl:items-end xl:justify-between">
			<div className="flex max-w-2xl items-start gap-3">
				<span className="mt-1 grid size-8 place-items-center rounded-lg bg-dashboard-primary-soft text-dashboard-primary">
					<LayoutDashboard className="size-4" />
				</span>
				<div>
					<h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
						{project.name} overview
					</h1>
					<p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground">
						A decision-ready view of feedback volume, unresolved risk, and the
						work that needs intervention in {project.name}.
					</p>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button variant="outline" size="lg" className="bg-background" disabled>
					<CalendarDays data-icon="inline-start" />
					Last 30 days
					<ChevronDown data-icon="inline-end" />
				</Button>
				<Button
					variant="outline"
					size="lg"
					nativeButton={false}
					render={<Link href={projectPath(project.slug, "feedback")} />}
					className="bg-background"
				>
					<Inbox data-icon="inline-start" />
					View feedback
				</Button>
				<Button
					size="lg"
					nativeButton={false}
					render={<Link href={projectPath(project.slug, "settings")} />}
				>
					<Plus data-icon="inline-start" />
					Project settings
				</Button>
			</div>
		</header>
	);
}
