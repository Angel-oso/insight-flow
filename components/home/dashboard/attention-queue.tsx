import { ArrowRight, Clock3, UserRoundX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { DashboardAttentionItem } from "./data";

const priorityStyles = {
	Critical:
		"border-dashboard-danger/25 bg-dashboard-danger-soft text-dashboard-danger",
	High: "border-dashboard-warning/30 bg-dashboard-warning-soft text-dashboard-warning-foreground",
};

export function AttentionQueue({
	items,
}: {
	readonly items: readonly DashboardAttentionItem[];
}) {
	return (
		<Card className="gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="flex flex-row items-start justify-between border-b px-5 py-5 sm:px-6">
				<div>
					<h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">
						Needs intervention
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Critical, unassigned, or stale feedback ordered by urgency.
					</p>
				</div>
				<span className="rounded-md bg-dashboard-danger-soft px-2 py-1 text-xs font-semibold text-dashboard-danger">
					{items.length} items
				</span>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				<ul className="divide-y">
					{items.length > 0 ? (
						items.map((item) => (
							<li
								key={item.title}
								className="group grid gap-3 px-5 py-4 transition-colors hover:bg-muted/45 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
							>
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<span
											className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${priorityStyles[item.priority]}`}
										>
											{item.priority}
										</span>
										<p className="truncate text-sm font-semibold">
											{item.title}
										</p>
									</div>
									<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
										<span>{item.project}</span>
										<span className="flex items-center gap-1">
											<UserRoundX className="size-3" />
											{item.reason}
										</span>
										<span className="flex items-center gap-1">
											<Clock3 className="size-3" />
											{item.age}
										</span>
									</div>
								</div>
								<Button
									disabled
									aria-label={`Review ${item.title}`}
									variant="ghost"
									size="icon-sm"
									className="justify-self-end text-muted-foreground"
								>
									<ArrowRight />
								</Button>
							</li>
						))
					) : (
						<li className="px-5 py-7 text-sm text-muted-foreground sm:px-6">
							No feedback currently needs intervention.
						</li>
					)}
				</ul>
				<div className="border-t px-5 py-3 sm:px-6">
					<Button
						variant="link"
						size="sm"
						className="h-auto px-0 text-dashboard-primary"
						disabled
					>
						Open triage queue <ArrowRight data-icon="inline-end" />
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
