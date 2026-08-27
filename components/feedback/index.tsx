import { hasCapability, type Role } from "@/lib/auth/permissions";
import type { Project } from "@/lib/projects";
import { feedbackItems } from "./data";
import { FeedbackHeader } from "./feedback-header";
import { FeedbackSummary } from "./feedback-summary";
import { FeedbackWorkspace } from "./feedback-workspace";

export function Feedback({
	project,
	role,
}: {
	readonly project: Project;
	readonly role: Role | null;
}) {
	const projectItems = feedbackItems.filter(
		(item) => item.project === project.name,
	);

	if (!role || !hasCapability(role, "feedback.view")) return null;

	return (
		<div className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
			<FeedbackHeader project={project} />
			<div className="mt-7 space-y-6">
				<FeedbackSummary items={projectItems} />
				<FeedbackWorkspace
					initialItems={projectItems}
					project={project}
					role={role}
				/>
			</div>
		</div>
	);
}
