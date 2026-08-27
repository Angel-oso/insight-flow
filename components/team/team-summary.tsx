import { CircleAlert, FolderKanban, UsersRound } from "lucide-react";

import type { Project } from "@/lib/projects";
import type { TeamMember } from "./data";

export function TeamSummary({
	members,
	project,
}: {
	readonly members: readonly TeamMember[];
	readonly project: Project;
}) {
	const managerCount = members.filter(
		(member) => member.role !== "Member",
	).length;
	const criticalFeedback = members.reduce(
		(total, member) => total + member.criticalFeedback,
		0,
	);
	const openFeedback = members.reduce(
		(total, member) => total + member.openFeedback,
		0,
	);

	return (
		<section
			className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
			aria-label="Team capacity summary"
		>
			<div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
				<div className="flex items-start gap-3 p-5">
					<UsersRound className="mt-0.5 size-4 text-dashboard-primary" />
					<div>
						<p className="text-sm font-medium">
							{members.length} active members
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{managerCount} people can coordinate work in {project.name}.
						</p>
					</div>
				</div>
				<div className="flex items-start gap-3 p-5">
					<FolderKanban className="mt-0.5 size-4 text-dashboard-info" />
					<div>
						<p className="text-sm font-medium">
							{openFeedback} open assignments
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Assignments shown here are scoped to {project.name}.
						</p>
					</div>
				</div>
				<div className="flex items-start gap-3 p-5">
					<CircleAlert className="mt-0.5 size-4 text-dashboard-danger" />
					<div>
						<p className="text-sm font-medium">
							{criticalFeedback} critical assignments
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Michael and Daniel are the current owners to check first.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
