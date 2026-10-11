import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { PresentedOverview } from "./model";

export function WorkloadPanel({ rows }: { readonly rows: NonNullable<PresentedOverview["workload"]> }) {
	const maximum = Math.max(1, ...rows.map((row) => row.openAssigned));
	return (
		<Card className="h-full gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="border-b px-5 py-5 sm:px-6">
				<h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">Workload by team member</h2>
				<p className="text-sm text-muted-foreground">Current open assignments in this project.</p>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				<ul className="divide-y">
					{rows.length === 0 ? <li className="px-5 py-6 text-sm text-muted-foreground sm:px-6">No project members can view feedback yet.</li> : rows.map((row, index) => (
						<li key={`${row.name}-${index}`} className="px-5 py-4 sm:px-6">
							<div className="flex items-center gap-3">
								<span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-dashboard-primary-soft text-xs font-semibold text-dashboard-primary">{row.initials}</span>
								<p className="min-w-0 flex-1 break-words text-sm font-medium">{row.name}</p>
								<span className="shrink-0 text-sm tabular-nums">{row.openAssigned} open</span>
							</div>
							<div aria-hidden="true" className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
								<div className="h-full rounded-full bg-dashboard-primary" style={{ width: `${row.openAssigned / maximum * 100}%` }} />
							</div>
							<p className="mt-2 text-xs text-muted-foreground">{row.criticalAssigned} in the highest priority lane</p>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
