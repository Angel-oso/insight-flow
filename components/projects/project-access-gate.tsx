"use client";

import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";

/** Prevents a stale or hand-written URL from running workspace queries. */
export function ProjectAccessGate({
	projectSlug,
	children,
}: {
	readonly projectSlug: string;
	readonly children: ReactNode;
}) {
	const projects = useQuery(api.projects.queries.list, {});
	if (projects === undefined) {
		return (
			<p role="status" className="p-8 text-sm text-muted-foreground">
				Checking project access…
			</p>
		);
	}
	if (!projects.some((project) => project.slug === projectSlug)) {
		return (
			<div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
				<h1 className="font-heading text-xl font-semibold tracking-[-0.02em]">
					Project unavailable
				</h1>
				<p className="mt-2 text-sm leading-6 text-muted-foreground">
					This project does not exist in your workspace, or you no longer have access to it. Select an available project from the sidebar.
				</p>
			</div>
		);
	}

	return <>{children}</>;
}
