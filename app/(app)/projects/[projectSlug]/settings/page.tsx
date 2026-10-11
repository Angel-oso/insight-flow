import type { Metadata } from "next";
import { CurrentProjectSettings } from "@/components/projects/project-settings";

export const metadata: Metadata = { title: "Project settings" };

export default function ProjectSettingsPage() {
	return <CurrentProjectSettings />;
}
