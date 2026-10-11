import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
	title: "InsightFlow — Turn feedback into better product decisions",
	description: "Collect, organize, and prioritize feedback in one shared workflow, from a public feedback link to a decision-ready dashboard.",
};

export default function Page() {
	return <LandingPage />;
}
