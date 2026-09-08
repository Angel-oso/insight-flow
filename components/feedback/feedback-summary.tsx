import { CircleAlert, ClipboardCheck, UserRoundX } from "lucide-react";

import type { FeedbackItem } from "./model";

export function FeedbackSummary({
	items,
}: {
	readonly items: readonly FeedbackItem[];
}) {
	const openItems = items.filter(
		(item) => item.status !== "Completed" && item.status !== "Discarded",
	);
	const needsTriage = openItems.filter((item) => item.status === "New").length;
	const unassigned = openItems.filter(
		(item) => item.assigneeId === null,
	).length;
	const critical = openItems.filter(
		(item) => item.priority === "Critical",
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
