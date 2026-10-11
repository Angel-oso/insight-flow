"use client";

import { ProjectSettings } from "@/components/project-settings";
import { useCurrentProject } from "./project-context";

export function CurrentProjectSettings() {
	const project = useCurrentProject();
	return <ProjectSettings key={project.slug} project={project} />;
}
