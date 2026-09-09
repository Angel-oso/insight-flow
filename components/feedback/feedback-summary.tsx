import { CircleAlert, ClipboardCheck, UserRoundX } from "lucide-react";

import type { Taxonomies } from "@/lib/taxonomy";
import {
	finalStatusValues,
	maxPriorityRank,
	minStatusRank,
	taxonomyItemFor,
} from "@/lib/taxonomy";
import type { FeedbackItem } from "./model";

export function FeedbackSummary({
	items,
	taxonomies,
}: {
	readonly items: readonly FeedbackItem[];
	readonly taxonomies: Taxonomies;
}) {
	const finals = finalStatusValues(taxonomies);
	const maxRank = maxPriorityRank(taxonomies);
	const minRank = minStatusRank(taxonomies);
	const openItems = items.filter((item) => !finals.has(item.status));
	const needsTriage = openItems.filter(
		(item) =>
			taxonomyItemFor(taxonomies.statuses, item.status).rank === minRank,
	).length;
	const unassigned = openItems.filter(
		(item) => item.assigneeId === null,
	).length;
	const critical = openItems.filter(
		(item) =>
			taxonomyItemFor(taxonomies.priorities, item.priority).rank === maxRank,
	).length;

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
					{openItems.length}
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
				<div className="flex items-center gap-2 text-dashboard-danger">
					<CircleAlert className="size-4" />
					<p className="text-xs font-semibold tracking-[0.08em] uppercase">
						Critical
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
