import {
	CircleCheckBig,
	Inbox,
	MessageSquareText,
	TriangleAlert,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardMetric } from "./data";

const toneStyles = {
	primary: "text-dashboard-primary",
	info: "text-dashboard-info",
	danger: "text-dashboard-danger",
	success: "text-dashboard-success",
};

const toneBackgrounds = {
	primary: "bg-dashboard-primary-soft",
	info: "bg-dashboard-info-soft",
	danger: "bg-dashboard-danger-soft",
	success: "bg-dashboard-success-soft",
};

const toneIcons = {
	primary: MessageSquareText,
	info: Inbox,
	danger: TriangleAlert,
	success: CircleCheckBig,
};

const dividerStyles = [
	"border-b sm:border-r xl:border-b-0",
	"border-b xl:border-r xl:border-b-0",
	"border-b sm:border-r sm:border-b-0",
	"",
];

export function MetricSummary({
	metrics,
}: {
	readonly metrics: readonly DashboardMetric[];
}) {
	return (
		<section aria-label="Feedback summary">
			<Card className="gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
				<CardContent className="grid p-0 sm:grid-cols-2 xl:grid-cols-4">
					{metrics.map((metric, index) => {
						const MetricIcon = toneIcons[metric.tone];

						return (
							<div
								key={metric.label}
								className={`min-h-36 p-5 sm:p-6 ${dividerStyles[index]}`}
							>
								<div className="flex items-start justify-between gap-4">
									<p className="pt-1 text-sm font-medium text-muted-foreground">
										{metric.label}
									</p>
									<span
										className={`grid size-8 place-items-center rounded-lg ${toneBackgrounds[metric.tone]} ${toneStyles[metric.tone]}`}
									>
										<MetricIcon className="size-4" aria-hidden="true" />
									</span>
								</div>
								<p className="mt-3 font-heading text-3xl font-semibold tracking-[-0.035em] tabular-nums">
									{metric.value}
								</p>
								<p className="mt-2 text-xs text-muted-foreground">
									<span className={`font-semibold ${toneStyles[metric.tone]}`}>
										{metric.change}
									</span>{" "}
									{metric.context}
								</p>
							</div>
						);
					})}
				</CardContent>
			</Card>
		</section>
	);
}
