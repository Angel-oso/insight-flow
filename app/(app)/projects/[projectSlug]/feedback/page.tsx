import type { Metadata } from "next";

import { Feedback } from "@/components/feedback";
import { getCurrentProjectRole } from "@/lib/auth/session";
import { getProjectBySlug } from "@/lib/projects";

export const metadata: Metadata = { title: "Feedback" };

export default async function ProjectFeedbackPage({
	params,
}: {
	readonly params: Promise<{ projectSlug: string }>;
}) {
	const { projectSlug } = await params;
	const role = await getCurrentProjectRole(projectSlug);

	return <Feedback project={getProjectBySlug(projectSlug)} role={role} />;
}
