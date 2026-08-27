import type { Project } from "@/lib/projects";
import { CapacityWatch } from "./capacity-watch";
import { teamMembers } from "./data";
import { MemberRoster } from "./member-roster";
import { RoleGuide } from "./role-guide";
import { TeamHeader } from "./team-header";
import { TeamSummary } from "./team-summary";

export function Team({ project }: { readonly project: Project }) {
	const projectMembers = teamMembers.filter((member) =>
		member.projects.includes(project.name),
	);

	return (
		<div className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
			<TeamHeader project={project} />
			<div className="mt-7 space-y-6">
				<TeamSummary members={projectMembers} project={project} />
				<section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
					<MemberRoster members={projectMembers} />
					<div className="space-y-6">
						<CapacityWatch members={projectMembers} project={project} />
						<RoleGuide />
					</div>
				</section>
			</div>
			<footer className="mt-8 border-t pt-5 text-xs text-muted-foreground">
				Illustrative {project.name} data · Workload reflects open feedback
				assigned to this project.
			</footer>
		</div>
	);
}
