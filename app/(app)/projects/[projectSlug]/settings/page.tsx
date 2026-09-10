import type { Metadata } from "next";

import { ProjectSettings } from "@/components/project-settings";
import { getProjectBySlug } from "@/lib/projects";
import { ProjectSettingsGate } from "./gate";

export const metadata: Metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({
	params,
}: {
	readonly params: Promise<{ projectSlug: string }>;
}) {
	const { projectSlug } = await params;

	return (
		<ProjectSettingsGate projectSlug={projectSlug}>
			{(role) => (
				<ProjectSettings project={getProjectBySlug(projectSlug)} role={role} />
			)}
		</ProjectSettingsGate>
	);
}
