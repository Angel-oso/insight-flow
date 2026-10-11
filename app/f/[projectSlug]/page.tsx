import type { Metadata } from "next";
import { PublicFeedbackForm } from "@/components/intake/public-feedback-form";

export const metadata: Metadata = {
	title: "Share feedback · InsightFlow",
};

export default async function FeedbackPage({ params }: {
	readonly params: Promise<{ projectSlug: string }>;
}) {
	const { projectSlug } = await params;
	return <PublicFeedbackForm key={projectSlug} projectSlug={projectSlug} />;
}
