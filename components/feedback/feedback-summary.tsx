import { CircleAlert, ClipboardCheck, UserRoundX } from "lucide-react";

import type { Taxonomies } from "@/lib/taxonomy";
import { taxonomyColorStyle } from "@/lib/taxonomy";

/** Queue counters computed on the server from aggregates. */
export type FeedbackQueueSummary = {
	readonly open: number;
	readonly needsTriage: number;
	readonly unassigned: number;
	readonly critical: number;
	/** Highest priority rank present in the open backlog (-1 if none). */
	readonly laneRank: number;
};

export function FeedbackSummary({
	summary,
	taxonomies,
}: {
	readonly summary: FeedbackQueueSummary;
	readonly taxonomies: Taxonomies;
}) {
	const { needsTriage, unassigned, critical, laneRank } = summary;
	const laneLabel =
		taxonomies.priorities.find((entry) => entry.rank === laneRank)?.label ??
		"Critical";
	const laneColor =
		taxonomies.priorities.find((entry) => entry.rank === laneRank)?.color;

	return (
		<section
			aria-label="Feedback queue summary"
			className="grid overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:grid-cols-4"
		>
			<div className="border-b p-5 md:border-r md:border-b-0">
				<p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
					Open feedback
				</p>
				<p className="mt-2 font-heading text-2xl font-semibold tabular-nums">
					{summary.open}
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Needs a product decision
				</p>
			</div>
			<div className="border-b p-5 md:border-r md:border-b-0">
				<div className="flex items-center gap-2 text-dashboard-info">
					<ClipboardCheck className="size-4" />
					<p className="text-xs font-semibold tracking-[0.08em] uppercase">
						New
					</p>
				</div>
				<p className="mt-2 font-heading text-2xl font-semibold tabular-nums">
					{needsTriage}
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Awaiting first triage
				</p>
			</div>
			<div className="border-b p-5 md:border-r md:border-b-0">
				<div className="flex items-center gap-2 text-dashboard-warning-foreground">
					<UserRoundX className="size-4" />
					<p className="text-xs font-semibold tracking-[0.08em] uppercase">
						Unassigned
					</p>
				</div>
				<p className="mt-2 font-heading text-2xl font-semibold tabular-nums">
					{unassigned}
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Need an accountable owner
				</p>
			</div>
			<div className="p-5">
				<div
					style={
						laneColor ? { color: taxonomyColorStyle(laneColor).color } : undefined
					}
					className={`flex items-center gap-2 ${laneColor ? "" : "text-dashboard-danger"}`}
				>
					<CircleAlert className="size-4" />
					<p className="text-xs font-semibold tracking-[0.08em] uppercase">
						{laneLabel}
					</p>
				</div>
				<p className="mt-2 font-heading text-2xl font-semibold tabular-nums">
					{critical}
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Require intervention now
				</p>
			</div>
		</section>
	);
}
