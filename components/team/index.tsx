"use client";

import type { Project } from "@/lib/projects";
import { MemberRoster } from "./member-roster";
import { TeamHeader } from "./team-header";
import { TeamSummary } from "./team-summary";
import { useProjectTeam } from "./use-team";

export function Team({ project }: { readonly project: Project }) {
	const team = useProjectTeam(project.slug);

	if (!team) {
		return (
			<div className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
				<TeamHeader project={project} />
				<p role="status" className="mt-7 text-muted-foreground">
					Loading team…
				</p>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
			<TeamHeader project={project} />
			<div className="mt-7 space-y-6">
				<TeamSummary summary={team.summary} project={project} />
				<MemberRoster members={team.members} />
			</div>
			<footer className="mt-8 border-t pt-5 text-xs text-muted-foreground">
				<p>Live {project.name} team data · Workload reflects open feedback.</p>
			</footer>
		</div>
	);
}
