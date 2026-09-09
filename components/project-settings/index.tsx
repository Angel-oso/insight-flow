import { hasCapability, type Role } from "@/lib/auth/permissions";
import type { Project } from "@/lib/projects";
import { ProjectSettingsWorkspace } from "./project-settings-workspace";
import { SettingsHeader } from "./settings-header";

export function ProjectSettings({
	project,
	role,
}: {
	readonly project: Project;
	readonly role: Role | null;
}) {
	if (!role || !hasCapability(role, "project.view")) return null;

	const canManage = hasCapability(role, "project.manage");

	return (
		<div className="mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
			<SettingsHeader project={project} />
			<ProjectSettingsWorkspace
				key={project.slug}
				canManage={canManage}
				project={project}
			/>
		</div>
	);
}
