import { MailPlus, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/projects";

export function TeamHeader({ project }: { readonly project: Project }) {
	return (
		<header className="flex flex-col gap-5 border-b pb-7 lg:flex-row lg:items-end lg:justify-between">
			<div className="flex max-w-2xl items-start gap-3">
				<span className="mt-1 grid size-8 place-items-center rounded-lg bg-dashboard-primary-soft text-dashboard-primary">
					<UsersRound className="size-4" />
				</span>
				<div>
					<h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
						{project.name} team
					</h1>
					<p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground">
						See who can act on {project.name} feedback, where work is
						concentrated, and how access is assigned.
					</p>
				</div>
			</div>
			<div className="flex flex-col items-start gap-2 sm:items-end">
				<Button
					disabled
					size="lg"
					title="Member invitations need workspace data."
				>
					<MailPlus data-icon="inline-start" />
					Invite member
				</Button>
				<p className="text-xs text-muted-foreground">
					Invitations are ready to connect to workspace data.
				</p>
			</div>
		</header>
	);
}
