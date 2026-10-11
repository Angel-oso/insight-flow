"use client";

import { Team } from "@/components/team";
import { useCurrentProject } from "./project-context";

export function ProjectTeam() {
	const project = useCurrentProject();
	return <Team key={project.slug} project={project} />;
}
