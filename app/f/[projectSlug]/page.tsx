import type { Metadata } from "next";
import { PublicFeedbackForm } from "@/components/intake/public-feedback-form";

export const metadata: Metadata = {
	title: "Share feedback · InsightFlow",
	// Each form belongs to a customer, who decides where to share it.
	robots: { index: false },
};

export default async function FeedbackPage({ params }: {
	readonly params: Promise<{ projectSlug: string }>;
}) {
	const { projectSlug } = await params;
	return <PublicFeedbackForm key={projectSlug} projectSlug={projectSlug} />;
}
