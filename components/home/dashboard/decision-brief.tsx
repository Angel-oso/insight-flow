import { ArrowRight, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { type Project, projectPath } from "@/lib/projects";

export function DecisionBrief({
	project,
	criticalItems,
	laneLabel,
}: {
	readonly project: Project;
	readonly criticalItems: number;
	readonly laneLabel: string;
}) {
	return (
		<section className="grid overflow-hidden rounded-xl bg-foreground text-background lg:grid-cols-[1fr_auto]">
			<div className="flex gap-4 p-5 sm:p-6">
				<span className="grid size-10 shrink-0 place-items-center rounded-lg bg-background/10">
					<ShieldAlert className="size-5" />
				</span>
				<div>
					<h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">
						{project.name} needs an ownership review.
					</h2>
					<p className="mt-1 max-w-3xl text-sm leading-6 text-background/70">
						{criticalItems} {laneLabel.toLowerCase()}{" "}
						{criticalItems === 1 ? "item remains" : "items remain"} open in
						this project. Use the queue to assign accountable owners before
						the backlog grows.
					</p>
				</div>
			</div>
			<div className="flex items-center border-t border-background/15 px-5 py-4 lg:border-t-0 lg:border-l lg:px-6">
				<Button
					variant="secondary"
					size="lg"
					nativeButton={false}
					render={<Link href={projectPath(project.slug, "feedback")} />}
					className="w-full bg-background text-foreground lg:w-auto"
				>
					Review priority queue <ArrowRight data-icon="inline-end" />
				</Button>
			</div>
		</section>
	);
}
