import { Settings2 } from "lucide-react";

import type { Project } from "@/lib/projects";

export function SettingsHeader({ project }: { readonly project: Project }) {
	return (
		<header className="flex flex-col gap-4 border-b pb-7 sm:flex-row sm:items-start sm:justify-between">
			<div className="flex max-w-2xl items-start gap-3">
				<span className="mt-1 grid size-8 place-items-center rounded-lg bg-dashboard-primary-soft text-dashboard-primary">
					<Settings2 className="size-4" />
				</span>
				<div>
					<h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
						Project settings
					</h1>
					<p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground sm:text-base">
						Control how {project.name} receives feedback, alerts its owners, and
						stays available to the team.
					</p>
				</div>
			</div>
			<div className="shrink-0 rounded-lg border bg-card px-3 py-2 text-sm">
				<p className="text-xs text-muted-foreground">Project key</p>
				<p className="mt-0.5 font-medium">{project.slug}</p>
			</div>
		</header>
	);
}
