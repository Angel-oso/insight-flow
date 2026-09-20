import type { Metadata } from "next";

import { ProjectSettings } from "@/components/project-settings";
import { getProjectBySlug } from "@/lib/projects";

export const metadata: Metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({
	params,
}: {
	readonly params: Promise<{ projectSlug: string }>;
}) {
	const { projectSlug } = await params;

	return <ProjectSettings project={getProjectBySlug(projectSlug)} />;
}
