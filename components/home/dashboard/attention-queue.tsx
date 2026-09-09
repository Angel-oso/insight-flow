import { ArrowRight, Clock3, UserRoundX } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { projectPath } from "@/lib/projects";
import { taxonomyColorStyle, taxonomyToneBadge } from "@/lib/taxonomy";
import type { OverviewAttentionItem } from "./model";

export function AttentionQueue({
	items,
	projectSlug,
}: {
	readonly items: readonly OverviewAttentionItem[];
	readonly projectSlug: string;
}) {
	return (
		<Card className="flex h-full flex-col gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
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
			<CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
				<ul className="max-h-[26rem] min-h-0 flex-1 divide-y overflow-y-auto">
					{items.length > 0 ? (
						items.map((item) => (
							<li key={item.id}>
								<Link
									href={`${projectPath(projectSlug, "feedback")}?feedback=${item.id}`}
									aria-label={`Review ${item.title}`}
									className="group grid gap-3 px-5 py-4 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
								>
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span
												style={item.color ? taxonomyColorStyle(item.color) : undefined}
												className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${item.color ? "" : `${taxonomyToneBadge[item.tone]} border-transparent`}`}
											>
												{item.priorityLabel}
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
									<ArrowRight className="size-4 justify-self-end text-muted-foreground transition-transform group-hover:translate-x-0.5" />
								</Link>
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
						nativeButton={false}
						render={<Link href={projectPath(projectSlug, "feedback")} />}
						className="h-auto px-0 text-dashboard-primary"
					>
						Open triage queue <ArrowRight data-icon="inline-end" />
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
