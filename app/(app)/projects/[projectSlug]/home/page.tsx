import type { Metadata } from "next";
import { ProjectDashboard } from "@/components/projects/project-dashboard";

export const metadata: Metadata = { title: "Overview" };

export default function ProjectHomePage() {
	return <ProjectDashboard />;
}
