import { AppShell } from "@/components/layout/app-shell";
import { ProjectAccessGate } from "@/components/projects/project-access-gate";
import { getProjectBySlug } from "@/lib/projects";

export default async function ProjectLayout({
	children,
	params,
}: {
	readonly children: React.ReactNode;
	readonly params: Promise<{ projectSlug: string }>;
}) {
	const { projectSlug } = await params;
	const project = getProjectBySlug(projectSlug);

	return (
		<AppShell project={project}>
			<ProjectAccessGate projectSlug={projectSlug}>
				{children}
			</ProjectAccessGate>
		</AppShell>
	);
}
