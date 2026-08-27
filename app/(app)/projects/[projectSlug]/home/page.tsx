import type { Metadata } from "next";

import { Dashboard } from "@/components/home/dashboard";
import { getProjectBySlug } from "@/lib/projects";

export const metadata: Metadata = { title: "Overview" };

export default async function ProjectHomePage({
	params,
}: {
	readonly params: Promise<{ projectSlug: string }>;
}) {
	const { projectSlug } = await params;
	return <Dashboard project={getProjectBySlug(projectSlug)} />;
}
