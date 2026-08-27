import { Card, CardContent } from "@/components/ui/card";
import type { Metric } from "./data";

export function MetricCard({ metric }: { readonly metric: Metric }) {
	const Icon = metric.icon;
	const [highlight, ...rest] = metric.detail.split(" ");

	return (
		<Card className="py-0 shadow-sm">
			<CardContent className="flex items-center gap-4 p-4">
				<span
					className={`grid size-11 shrink-0 place-items-center rounded-lg ${metric.iconClassName}`}
				>
					<Icon className="size-5" strokeWidth={1.8} />
				</span>
				<div>
					<p className="text-xs font-medium text-muted-foreground">
						{metric.label}
					</p>
					<p className="mt-0.5 text-2xl font-semibold tracking-tight">
						{metric.value}
					</p>
					<p className="mt-0.5 text-[10px] text-muted-foreground">
						<span className={`font-semibold ${metric.detailClassName}`}>
							{highlight}
						</span>
						{rest.length ? ` ${rest.join(" ")}` : null}
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
