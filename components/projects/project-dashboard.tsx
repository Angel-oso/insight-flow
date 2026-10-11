"use client";

import { Dashboard } from "@/components/home/dashboard";
import { useCurrentProject } from "./project-context";

export function ProjectDashboard() {
	const project = useCurrentProject();
	return <Dashboard key={project.slug} project={project} />;
}
