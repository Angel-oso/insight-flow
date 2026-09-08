"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FeedbackHeader } from "./feedback-header";
import { FeedbackSummary } from "./feedback-summary";
import { FeedbackWorkspace } from "./feedback-workspace";
import { initials, presentFeedback } from "./model";
import { useFeedbackClock } from "./use-feedback";

function FeedbackContent({ projectSlug }: { readonly projectSlug: string }) {
	const data = useQuery(api.feedback.workspace, { projectSlug });
	const now = useFeedbackClock();
	if (!data)
		return (
			<p role="status" className="p-8 text-muted-foreground">
				Loading feedback…
			</p>
		);
	const items = data.items.map((item) =>
		presentFeedback(item, data.project.name, now),
	);
	const assignees = data.assignees.map((user) => ({
		id: user._id,
		name: user.name,
		initials: initials(user.name),
	}));
	return (
		<div className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
			<FeedbackHeader project={data.project} />
			<div className="mt-7 space-y-6">
				<FeedbackSummary items={items} />
				<FeedbackWorkspace
					items={items}
					project={data.project}
					role={data.role}
					assignees={assignees}
					taxonomies={data.taxonomies}
					now={now}
					archived={data.project.status === "Archived"}
				/>
			</div>
		</div>
	);
}

export function Feedback({ projectSlug }: { readonly projectSlug: string }) {
	return <FeedbackContent key={projectSlug} projectSlug={projectSlug} />;
}
