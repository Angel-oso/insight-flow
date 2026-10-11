"use client";

import { useQuery } from "convex/react";
import type { Project } from "@/lib/projects";
import { api } from "@/convex/_generated/api";
import { hasCapability } from "@/lib/auth/permissions";
import { MemberRoster } from "./member-roster";
import { TeamHeader } from "./team-header";
import { ProjectInvitations } from "./project-invitations";
import { TeamSummary } from "./team-summary";
import { useProjectTeam } from "./use-team";

export function Team({ project }: { readonly project: Project }) {
	const team = useProjectTeam(project.slug);
	const roleSettings = useQuery(api.projects.settings.roles, { projectSlug: project.slug });
	const access = useQuery(api.projects.settings.access, { projectSlug: project.slug });
	const viewer = useQuery(api.users.queries.current, {});
	const canManageTeam = access ? hasCapability(access.permissions, "team.manage") : false;

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
			<div className="flex items-start justify-between gap-4">
				<TeamHeader project={project} />
				<ProjectInvitations projectSlug={project.slug} />
			</div>
			<div className="mt-7 space-y-6">
				<TeamSummary summary={team.summary} project={project} />
				<MemberRoster
					members={team.members}
					projectSlug={project.slug}
					roles={roleSettings?.roles ?? []}
					canManageRoles={roleSettings?.canManageRoles ?? false}
					canManageTeam={canManageTeam}
					currentUserId={viewer?.id ?? null}
					showsWorkload={team.showsWorkload}
				/>
			</div>
			<footer className="mt-8 border-t pt-5 text-xs text-muted-foreground">
				<p>Live {project.name} team data · Workload reflects open feedback.</p>
			</footer>
		</div>
	);
}
