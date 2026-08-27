import type { Metadata } from "next";

import { Team } from "@/components/team";
import { getProjectBySlug } from "@/lib/projects";

export const metadata: Metadata = { title: "Team" };

export default async function ProjectTeamPage({
	params,
}: {
	readonly params: Promise<{ projectSlug: string }>;
}) {
	const { projectSlug } = await params;
	return <Team project={getProjectBySlug(projectSlug)} />;
}
