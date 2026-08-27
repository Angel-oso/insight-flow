import { ArrowUpRight, CircleHelp } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FeedbackTrendChart } from "./charts";
import type { DashboardTrendRow } from "./data";

export function TrendPanel({
	rows,
}: {
	readonly rows: readonly DashboardTrendRow[];
}) {
	return (
		<Card className="gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="flex flex-row items-start justify-between border-b px-5 py-5 sm:px-6">
				<div>
					<h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">
						Feedback movement
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Received and resolved feedback across the selected period.
					</p>
				</div>
				<CircleHelp
					className="mt-1 size-4 text-muted-foreground"
					aria-label="Daily totals are based on the selected date range"
				/>
			</CardHeader>
			<CardContent className="px-3 pt-5 pb-4 sm:px-5">
				<div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-2">
					<div className="flex items-center gap-5 text-xs text-muted-foreground">
						<span className="flex items-center gap-2">
							<span className="size-2 rounded-full bg-dashboard-primary" />
							Received
						</span>
						<span className="flex items-center gap-2">
							<span className="size-2 rounded-full bg-dashboard-success" />
							Resolved
						</span>
					</div>
					<p className="flex items-center gap-1 text-xs font-medium text-dashboard-success">
						<ArrowUpRight className="size-3.5" />
						Resolution pace improved 5.2%
					</p>
				</div>
				<figure className="min-w-0 overflow-hidden">
					<FeedbackTrendChart rows={rows} />
				</figure>
			</CardContent>
		</Card>
	);
}
