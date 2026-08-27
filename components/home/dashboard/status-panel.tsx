import { ArrowUpRight } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CategoriesChart, StatusDonutChart } from "./charts";
import type { DashboardCategoryItem, DashboardStatusItem } from "./data";

export function StatusPanel({
	categories,
	statuses,
}: {
	readonly categories: readonly DashboardCategoryItem[];
	readonly statuses: readonly DashboardStatusItem[];
}) {
	const total = statuses.reduce((sum, item) => sum + item.value, 0);
	const leadingCategory = categories[0]?.label ?? "No data";

	return (
		<Card className="gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="border-b px-5 py-5">
				<h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">
					Backlog composition
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Where feedback sits and what teams ask for most.
				</p>
			</CardHeader>
			<CardContent className="p-5">
				<div className="grid grid-cols-[124px_1fr] items-center gap-5">
					<StatusDonutChart items={statuses} total={total} />
					<ul className="space-y-1.5">
						{statuses.map((item) => (
							<li key={item.label} className="flex items-center gap-2 text-xs">
								<span
									className="size-1.5 rounded-full"
									style={{ backgroundColor: item.token }}
								/>
								<span className="flex-1 text-muted-foreground">
									{item.label}
								</span>
								<span className="font-medium tabular-nums">{item.value}</span>
							</li>
						))}
					</ul>
				</div>
				<div className="my-5 border-t" />
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-semibold">Top categories</h3>
					<span className="flex items-center gap-1 text-xs font-medium text-dashboard-primary">
						{leadingCategory} <ArrowUpRight className="size-3" />
					</span>
				</div>
				<div className="mt-2 min-w-0 overflow-hidden">
					<CategoriesChart items={categories} />
				</div>
			</CardContent>
		</Card>
	);
}
