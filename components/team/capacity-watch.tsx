import { ArrowRight, CircleAlert, UserRoundPlus } from "lucide-react";
import type { Project } from "@/lib/projects";
import type { TeamMember } from "./data";

export function CapacityWatch({
	members,
	project,
}: {
	readonly members: readonly TeamMember[];
	readonly project: Project;
}) {
	const criticalFeedback = members.reduce(
		(total, member) => total + member.criticalFeedback,
		0,
	);
	const openFeedback = members.reduce(
		(total, member) => total + member.openFeedback,
		0,
	);
	const nextOwner = [...members].sort(
		(left, right) => right.openFeedback - left.openFeedback,
	)[0];

	return (
		<section className="rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
			<div className="flex items-start gap-3">
				<span className="grid size-9 place-items-center rounded-lg bg-dashboard-danger-soft text-dashboard-danger">
					<CircleAlert className="size-4" />
				</span>
				<div>
					<h2 className="font-heading text-base font-semibold tracking-[-0.02em]">
						Capacity watch
					</h2>
					<p className="mt-1 text-sm leading-6 text-muted-foreground">
						{project.name} has {criticalFeedback} critical assignments across
						its active owners. Review the unassigned queue before adding more
						work.
					</p>
				</div>
			</div>
			<div className="mt-5 space-y-3 border-t pt-4 text-sm">
				<p className="flex items-center justify-between gap-3">
					<span className="text-muted-foreground">Unassigned feedback</span>
					<span className="font-medium tabular-nums">{openFeedback} items</span>
				</p>
				<p className="flex items-center justify-between gap-3">
					<span className="text-muted-foreground">Next owner to review</span>
					<span className="flex items-center gap-1 font-medium">
						{nextOwner?.name ?? "No owner"} <ArrowRight className="size-3" />
					</span>
				</p>
			</div>
			<p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
				<UserRoundPlus className="size-3.5" />
				Membership actions become available with workspace data.
			</p>
		</section>
	);
}
