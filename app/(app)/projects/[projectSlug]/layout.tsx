import { AppShell } from "@/components/layout/app-shell";
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

	return <AppShell project={project}>{children}</AppShell>;
}
