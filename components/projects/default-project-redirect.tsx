"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { api } from "@/convex/_generated/api";
import { projectPath } from "@/lib/projects";

/** Opens the requested section in the caller's first actual project. */
export function DefaultProjectRedirect({
	section,
}: {
	readonly section: "home" | "feedback" | "team";
}) {
	const router = useRouter();
	const projects = useQuery(api.projects.queries.list, {});
	const project = projects?.[0];

	useEffect(() => {
		if (project) router.replace(projectPath(project.slug, section));
	}, [project, router, section]);

	return (
		<p role="status" className="p-8 text-sm text-muted-foreground">
			{projects?.length === 0
				? "No projects available. Ask a workspace administrator to add you to a project."
				: "Opening your workspace…"}
		</p>
	);
}
