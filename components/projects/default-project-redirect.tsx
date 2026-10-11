"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { api } from "@/convex/_generated/api";
import { projectPath } from "@/lib/projects";

/** Sends /home to the caller's first actual project, never to mock data. */
export function DefaultProjectRedirect() {
	const router = useRouter();
	const projects = useQuery(api.projects.queries.list, {});
	const project = projects?.[0];

	useEffect(() => {
		if (project) router.replace(projectPath(project.slug, "home"));
	}, [project, router]);

	return (
		<p role="status" className="p-8 text-sm text-muted-foreground">
			Opening your workspace…
		</p>
	);
}
