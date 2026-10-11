import type { Metadata } from "next";
import { DefaultProjectRedirect } from "@/components/projects/default-project-redirect";

export const metadata: Metadata = { title: "Feedback" };

export default function FeedbackPage() {
	return <DefaultProjectRedirect section="feedback" />;
}
