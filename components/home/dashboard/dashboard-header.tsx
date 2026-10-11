import {
	CalendarDays,
	ChevronDown,
	Inbox,
	LayoutDashboard,
	Plus,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Project, projectPath } from "@/lib/projects";
import { OVERVIEW_RANGES, type OverviewRange } from "./use-overview";

export function DashboardHeader({
	project,
	rangeDays,
	onRangeChange,
}: {
	readonly project: Project;
	readonly rangeDays: OverviewRange;
	readonly onRangeChange: (range: OverviewRange) => void;
}) {
	return (
		<header className="flex flex-col gap-6 border-b pb-7 xl:flex-row xl:items-end xl:justify-between">
			<div className="flex max-w-2xl items-start gap-3">
				<span className="mt-1 grid size-8 place-items-center rounded-lg bg-dashboard-primary-soft text-dashboard-primary">
					<LayoutDashboard className="size-4" />
				</span>
				<div>
					<h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
						{project.name} overview
					</h1>
					<p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground">
						A decision-ready view of feedback volume, unresolved risk, and the
						work that needs intervention in {project.name}.
					</p>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								variant="outline"
								size="lg"
								className="bg-background"
								aria-label={`Date range: last ${rangeDays} days`}
							>
								<CalendarDays data-icon="inline-start" />
								Last {rangeDays} days
								<ChevronDown data-icon="inline-end" />
							</Button>
						}
					/>
					<DropdownMenuContent align="end" className="w-44">
						<DropdownMenuGroup>
							<DropdownMenuLabel>Date range</DropdownMenuLabel>
							<DropdownMenuRadioGroup
								value={String(rangeDays)}
								onValueChange={(value) =>
									onRangeChange(Number(value) as OverviewRange)
								}
							>
								{OVERVIEW_RANGES.map((range) => (
									<DropdownMenuRadioItem key={range} value={String(range)}>
										Last {range} days
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					variant="outline"
					size="lg"
					nativeButton={false}
					render={<Link href={projectPath(project.slug, "feedback")} />}
					className="bg-background"
				>
					<Inbox data-icon="inline-start" />
					View feedback
				</Button>
				<Button
					size="lg"
					nativeButton={false}
					render={<Link href={projectPath(project.slug, "settings")} />}
				>
					<Plus data-icon="inline-start" />
					Project settings
				</Button>
			</div>
		</header>
	);
}
