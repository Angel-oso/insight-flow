"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Project } from "@/lib/projects";

const ProjectContext = createContext<Project | null>(null);

export function ProjectProvider({
	project,
	children,
}: {
	readonly project: Project;
	readonly children: ReactNode;
}) {
	return (
		<ProjectContext.Provider value={project}>
			{children}
		</ProjectContext.Provider>
	);
}

export function useCurrentProject(): Project {
	const project = useContext(ProjectContext);
	if (!project) {
		throw new Error("useCurrentProject must be used within ProjectProvider.");
	}
	return project;
}
