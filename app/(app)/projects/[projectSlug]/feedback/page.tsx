import type { Metadata } from "next";

import { Feedback } from "@/components/feedback";

export const metadata: Metadata = { title: "Feedback" };

export default async function ProjectFeedbackPage({
	params,
}: {
	readonly params: Promise<{ projectSlug: string }>;
}) {
	const { projectSlug } = await params;

	return <Feedback projectSlug={projectSlug} />;
}
