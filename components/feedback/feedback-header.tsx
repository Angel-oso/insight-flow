import { Inbox } from "lucide-react";
import type { Project } from "@/lib/projects";

export function FeedbackHeader({ project }: { readonly project: Project }) {
	return (
		<header className="border-b pb-7">
			<div className="flex items-start gap-3">
				<span className="mt-1 grid size-8 place-items-center rounded-lg bg-dashboard-primary-soft text-dashboard-primary">
					<Inbox className="size-4" />
				</span>
				<div>
					<h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
						{project.name} feedback
					</h1>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
						Review incoming signals for {project.name}, make a triage decision,
						and keep each product conversation traceable.
					</p>
				</div>
			</div>
		</header>
	);
}
