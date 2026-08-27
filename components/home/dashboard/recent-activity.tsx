import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { activities } from "./data";
import { SectionHeading } from "./section-heading";

export function RecentActivity() {
	return (
		<Card className="py-0 shadow-sm">
			<CardHeader className="px-4 pt-3">
				<SectionHeading title="Recent activity" />
			</CardHeader>
			<CardContent className="px-3 pb-3">
				<div className="space-y-2">
					{activities.map((activity) => (
						<div
							className="flex gap-2"
							key={`${activity.name}-${activity.date}`}
						>
							<span
								className={`grid size-6 shrink-0 place-items-center rounded-full text-[9px] font-medium text-white ${activity.color}`}
							>
								{activity.initials}
							</span>
							<div className="min-w-0 flex-1 text-[10px]">
								<p className="truncate">
									<span className="font-semibold">{activity.name}</span>{" "}
									{activity.action}{" "}
									{activity.status ? (
										<span
											className={
												activity.status === "Completed"
													? "ml-1 rounded border border-dashboard-success/30 bg-dashboard-success-soft px-1.5 py-0.5 text-[9px] text-dashboard-success"
													: "ml-1 rounded border border-dashboard-info/30 bg-dashboard-info-soft px-1.5 py-0.5 text-[9px] text-dashboard-info"
											}
										>
											{activity.status}
										</span>
									) : null}
								</p>
								<p className="text-muted-foreground">
									{activity.project} · {activity.date}
								</p>
							</div>
						</div>
					))}
				</div>
				<Button
					variant="link"
					size="xs"
					className="mt-2 h-auto px-0 text-dashboard-primary"
				>
					View all activity <ChevronRight />
				</Button>
			</CardContent>
		</Card>
	);
}
