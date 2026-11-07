"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FeedbackHeader } from "./feedback-header";
import { FeedbackSummary } from "./feedback-summary";
import { FeedbackWorkspace } from "./feedback-workspace";
import { initials } from "./model";
import { useFeedbackClock } from "./use-feedback";

function FeedbackContent({ projectSlug }: { readonly projectSlug: string }) {
	const data = useQuery(api.feedback.queries.workspace, { projectSlug });
	const viewer = useQuery(api.users.queries.current, {});
	const now = useFeedbackClock();
	// Wait for the viewer too: a member's inbox opens on their own queue.
	if (!data || viewer === undefined)
		return (
			<p role="status" className="p-8 text-muted-foreground">
				Loading feedback…
			</p>
		);
	const assignees = data.assignees.map((user) => {
		const name = user.name ?? "Former member";
		return { id: user._id, name, initials: initials(name) };
	});
	return (
		<div className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
			<FeedbackHeader project={data.project} />
			<div className="mt-7 space-y-6">
				<FeedbackSummary summary={data.summary} taxonomies={data.taxonomies} />
				<FeedbackWorkspace
					project={data.project}
					role={data.role}
					grantedPermissions={data.permissions}
					assignees={assignees}
					taxonomies={data.taxonomies}
					totalItems={data.summary.total}
					laneRank={data.summary.laneRank}
					now={now}
					archived={data.project.status === "Archived"}
					viewerId={viewer?.id ?? null}
					defaultPriority={data.project.defaultPriority}
				/>
			</div>
		</div>
	);
}

export function Feedback({ projectSlug }: { readonly projectSlug: string }) {
	return <FeedbackContent key={projectSlug} projectSlug={projectSlug} />;
}
