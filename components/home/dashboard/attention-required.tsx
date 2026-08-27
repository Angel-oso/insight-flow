import { ChevronRight, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { attentionItems } from "./data";
import { SectionHeading } from "./section-heading";

const priorityStyles = {
	Critical:
		"border-dashboard-danger/30 bg-dashboard-danger-soft text-dashboard-danger",
	High: "border-dashboard-danger/20 bg-dashboard-danger-soft text-dashboard-danger",
	Medium:
		"border-dashboard-warning/20 bg-dashboard-warning-soft text-dashboard-warning",
};

export function AttentionRequired() {
	return (
		<Card className="py-0 shadow-sm">
			<CardHeader className="px-4 pt-3">
				<SectionHeading title="Attention required" />
			</CardHeader>
			<CardContent className="px-3 pb-3">
				<div className="divide-y">
					{attentionItems.map((item) => (
						<div
							className="grid grid-cols-[54px_minmax(0,1fr)_minmax(80px,0.9fr)_52px] items-center gap-2 py-1.5 text-[11px]"
							key={item.title}
						>
							<span
								className={`w-fit rounded border px-1.5 py-0.5 text-[10px] font-medium ${priorityStyles[item.priority]}`}
							>
								{item.priority}
							</span>
							<span className="truncate font-medium">{item.title}</span>
							<span className="hidden items-center gap-1 truncate text-muted-foreground sm:flex">
								<Folder className="size-3 text-dashboard-primary" />
								{item.project}
							</span>
							<span className="flex items-center justify-end gap-2">
								<time className="hidden text-muted-foreground lg:block">
									{item.date}
								</time>
								<Button size="xs" variant="outline">
									Review
								</Button>
							</span>
						</div>
					))}
				</div>
				<Button
					variant="link"
					size="xs"
					className="mt-2 h-auto px-0 text-dashboard-primary"
				>
					View all attention items <ChevronRight />
				</Button>
			</CardContent>
		</Card>
	);
}
