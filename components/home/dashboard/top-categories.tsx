import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { categories } from "./data";
import { SectionHeading } from "./section-heading";

export function TopCategories() {
	return (
		<Card className="py-0 shadow-sm">
			<CardHeader className="px-4 pt-3">
				<SectionHeading title="Top categories" />
			</CardHeader>
			<CardContent className="px-4 pb-3">
				<div className="space-y-2.5">
					{categories.map((category) => (
						<div
							key={category.label}
							className="grid grid-cols-[92px_1fr_26px] items-center gap-2 text-[10px]"
						>
							<span className="text-right text-muted-foreground">
								{category.label}
							</span>
							<div className="h-3.5 border-l border-dashboard-chart-grid">
								<div
									className="h-full bg-dashboard-primary"
									style={{ width: `${(category.value / 102) * 100}%` }}
								/>
							</div>
							<span className="text-muted-foreground">{category.value}</span>
						</div>
					))}
				</div>
				<div className="ml-[102px] mt-2 flex justify-between border-t pt-1 text-[9px] text-muted-foreground">
					<span>0</span>
					<span>25</span>
					<span>50</span>
					<span>75</span>
					<span>100</span>
				</div>
			</CardContent>
		</Card>
	);
}
