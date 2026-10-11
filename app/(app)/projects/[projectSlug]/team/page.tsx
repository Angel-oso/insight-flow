import type { Metadata } from "next";
import { ProjectTeam } from "@/components/projects/project-team";

export const metadata: Metadata = { title: "Team" };

export default function ProjectTeamPage() {
	return <ProjectTeam />;
}
