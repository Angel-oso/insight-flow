"use client";

import { useQuery } from "convex/react";
import { hasCapability } from "@/lib/auth/permissions";
import { api } from "@/convex/_generated/api";
import type { Project } from "@/lib/projects";
import { ProjectSettingsWorkspace } from "./project-settings-workspace";
import { RoleManager } from "./role-manager";
import { SettingsHeader } from "./settings-header";

export function ProjectSettings({
	project,
}: {
	readonly project: Project;
}) {
	const access = useQuery(api.projects.settings.access, { projectSlug: project.slug });
	if (!access || !hasCapability(access.permissions, "project.view")) return null;

	const canManage = hasCapability(access.permissions, "project.manage");
	const canManageRoles = hasCapability(access.permissions, "organization.manage");

	return (
		<div className="mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
			<SettingsHeader project={project} />
			<ProjectSettingsWorkspace
				key={project.slug}
				canManage={canManage}
				canManageTaxonomies={canManageRoles}
				project={project}
			/>
			{canManageRoles ? <RoleManager projectSlug={project.slug} disabled={!canManage} /> : null}
		</div>
	);
}
