import { CurrentProjectShell } from "@/components/projects/current-project-shell";
import { ProjectAccessGate } from "@/components/projects/project-access-gate";

export default async function ProjectLayout({
	children,
	params,
}: {
	readonly children: React.ReactNode;
	readonly params: Promise<{ projectSlug: string }>;
}) {
	const { projectSlug } = await params;

	return (
		<ProjectAccessGate projectSlug={projectSlug}>
			<CurrentProjectShell>{children}</CurrentProjectShell>
		</ProjectAccessGate>
	);
}
