import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Feedback",
};

export default function FeedbackPage() {
	redirect("/projects/client-portal/feedback");
}
