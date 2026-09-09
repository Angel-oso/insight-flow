import { UsersRound } from "lucide-react";

import type { Project } from "@/lib/projects";

export function TeamHeader({ project }: { readonly project: Project }) {
	return (
		<header className="border-b pb-7">
			<div className="flex max-w-2xl items-start gap-3">
				<span className="mt-1 grid size-8 place-items-center rounded-lg bg-dashboard-primary-soft text-dashboard-primary">
					<UsersRound className="size-4" />
				</span>
				<div>
					<h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
						{project.name} team
					</h1>
					<p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground">
						See who can act on {project.name} feedback and where work is
						concentrated.
					</p>
				</div>
			</div>
		</header>
	);
}
