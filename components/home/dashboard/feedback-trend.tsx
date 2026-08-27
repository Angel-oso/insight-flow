import { CircleHelp } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { trendValues } from "./data";
import { SectionHeading } from "./section-heading";

const chartWidth = 680;
const chartHeight = 172;
const left = 32;
const right = 8;
const top = 10;
const bottom = 30;

function pointFor(value: number, index: number) {
	const x =
		left + (index / (trendValues.length - 1)) * (chartWidth - left - right);
	const y = top + ((40 - value) / 40) * (chartHeight - top - bottom);
	return { x, y };
}

export function FeedbackTrend() {
	const points = trendValues
		.map((value, index) => {
			const { x, y } = pointFor(value, index);
			return `${x},${y}`;
		})
		.join(" ");
	const labels = [
		"Apr 24",
		"Apr 29",
		"May 4",
		"May 9",
		"May 14",
		"May 19",
		"May 24",
	];
	return (
		<Card className="py-0 shadow-sm">
			<CardHeader className="px-4 pt-3">
				<SectionHeading
					title="Feedback trend"
					description="Received feedback across 30 days."
					action={
						<CircleHelp className="mt-0.5 size-3.5 text-muted-foreground" />
					}
				/>
			</CardHeader>
			<CardContent className="px-3 pb-2">
				<svg
					className="h-auto w-full"
					viewBox={`0 0 ${chartWidth} ${chartHeight}`}
					role="img"
					aria-label="Received feedback trend across 30 days"
				>
					{[0, 10, 20, 30, 40].map((value) => {
						const y = top + ((40 - value) / 40) * (chartHeight - top - bottom);
						return (
							<g key={value}>
								<line
									x1={left}
									x2={chartWidth - right}
									y1={y}
									y2={y}
									stroke="var(--dashboard-chart-grid)"
									strokeWidth="1"
								/>
								<text
									x="6"
									y={y + 3}
									fill="var(--muted-foreground)"
									fontSize="10"
								>
									{value}
								</text>
							</g>
						);
					})}
					<polyline
						fill="none"
						points={points}
						stroke="var(--dashboard-primary)"
						strokeWidth="2.25"
						strokeLinejoin="round"
						strokeLinecap="round"
					/>
					{trendValues.map((value, index) => {
						const { x, y } = pointFor(value, index);
						return (
							<circle
								key={`${value}-${pointFor(value, index).x}`}
								cx={x}
								cy={y}
								fill="var(--dashboard-primary)"
								r="3"
							/>
						);
					})}
					{labels.map((label, index) => (
						<text
							key={label}
							x={
								left +
								(index / (labels.length - 1)) * (chartWidth - left - right)
							}
							y={chartHeight - 10}
							textAnchor={
								index === 0
									? "start"
									: index === labels.length - 1
										? "end"
										: "middle"
							}
							fill="var(--muted-foreground)"
							fontSize="10"
						>
							{label}
						</text>
					))}
				</svg>
				<p className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
					<span className="h-0.5 w-4 rounded-full bg-dashboard-primary" />
					Received feedback
				</p>
			</CardContent>
		</Card>
	);
}
