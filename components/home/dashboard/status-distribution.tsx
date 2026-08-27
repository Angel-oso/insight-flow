import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { statusItems } from "./data";
import { SectionHeading } from "./section-heading";

const total = statusItems.reduce((sum, item) => sum + item.value, 0);

export function StatusDistribution() {
	let start = 0;
	const segments = statusItems.map((item) => {
		const segment = { ...item, start, end: start + (item.value / total) * 100 };
		start = segment.end;
		return segment;
	});
	const gradient = segments
		.map((item) => `${item.color} ${item.start}% ${item.end}%`)
		.join(", ");

	return (
		<Card className="py-0 shadow-sm">
			<CardHeader className="px-4 pt-3">
				<SectionHeading title="Status distribution" />
			</CardHeader>
			<CardContent className="flex flex-col items-center gap-5 px-4 pb-4 sm:flex-row sm:justify-center">
				<div
					className="grid size-36 place-items-center rounded-full"
					style={{ background: `conic-gradient(${gradient})` }}
				>
					<div className="grid size-[88px] place-items-center rounded-full bg-card text-center">
						<strong className="text-xl leading-none">{total}</strong>
						<span className="text-[10px] text-muted-foreground">Total</span>
					</div>
				</div>
				<ul className="w-full max-w-[205px] space-y-2">
					{statusItems.map((item) => (
						<li
							key={item.label}
							className="flex items-center gap-2 text-[11px]"
						>
							<span
								className="size-2 rounded-full"
								style={{ backgroundColor: item.color }}
							/>
							<span className="flex-1 text-muted-foreground">{item.label}</span>
							<span className="text-muted-foreground">
								{item.value} ({Math.round((item.value / total) * 100)}%)
							</span>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
