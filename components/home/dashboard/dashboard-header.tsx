import { CalendarDays, ChevronDown, Inbox, LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type Project, projectPath } from "@/lib/projects";
import { customWindow, OVERVIEW_RANGES, type OverviewRange } from "./date-window";

export type DateRangeControlProps = {
	readonly range: OverviewRange;
	readonly rangeLabel: string;
	readonly fromDate: string;
	readonly toDate: string;
	readonly today: string;
	readonly onRangeChange: (range: OverviewRange) => void;
	readonly onCustomChange: (from: string, to: string) => void;
};

/** Shared UTC range picker for project and organization overviews. */
export function DateRangeControl({ range, rangeLabel, fromDate, toDate, today, onRangeChange, onCustomChange }: DateRangeControlProps) {
	const [customOpen, setCustomOpen] = useState(false);
	const [draftFrom, setDraftFrom] = useState(fromDate);
	const [draftTo, setDraftTo] = useState(toDate);
	const validCustom = customWindow(draftFrom, draftTo, Date.parse(`${today}T23:59:59.999Z`));
	function openCustom() {
		setDraftFrom(fromDate);
		setDraftTo(toDate);
		setCustomOpen(true);
	}
	return <>
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" size="lg" className="bg-background" aria-label={`Date range: ${rangeLabel}`}><CalendarDays data-icon="inline-start" />{rangeLabel}<ChevronDown data-icon="inline-end" /></Button>} />
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Date range</DropdownMenuLabel>
					<DropdownMenuRadioGroup value={range} onValueChange={(value) => {
						if (value === "custom") openCustom();
						else onRangeChange(value as OverviewRange);
					}}>
						{OVERVIEW_RANGES.map((range) => <DropdownMenuRadioItem key={range} value={String(range)}>{range === "custom" ? "Custom…" : `Last ${range} days`}</DropdownMenuRadioItem>)}
					</DropdownMenuRadioGroup>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
		{range === "custom" && <Button variant="ghost" onClick={openCustom}>Edit dates</Button>}
		<Sheet open={customOpen} onOpenChange={setCustomOpen}>
			<SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-xl">
				<SheetHeader><SheetTitle>Custom date range</SheetTitle><SheetDescription>Include both dates, up to 365 days. Dates use UTC.</SheetDescription></SheetHeader>
				<form className="space-y-4 px-4 pb-6" onSubmit={(event) => {
					event.preventDefault();
					if (!validCustom) return;
					onCustomChange(draftFrom, draftTo);
					setCustomOpen(false);
				}}>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="space-y-2 text-sm font-medium"><span>From</span><Input type="date" required value={draftFrom} max={draftTo && draftTo <= today ? draftTo : today} onChange={(event) => setDraftFrom(event.target.value)} aria-describedby="custom-date-hint" /></label>
						<label className="space-y-2 text-sm font-medium"><span>To (inclusive)</span><Input type="date" required value={draftTo} min={draftFrom} max={today} onChange={(event) => setDraftTo(event.target.value)} aria-describedby="custom-date-hint" /></label>
					</div>
					<p id="custom-date-hint" role="status" className="text-sm text-muted-foreground">{validCustom ? validCustom.label : "Choose valid dates through today, covering no more than 365 days."}</p>
					<Button type="submit" disabled={!validCustom}>Apply date range</Button>
				</form>
			</SheetContent>
		</Sheet>
	</>;
}

export function DashboardHeader({ project, canManageProject, ...dates }: DateRangeControlProps & { readonly project: Project; readonly canManageProject: boolean }) {
	return (
		<header className="flex flex-col gap-6 border-b pb-7 xl:flex-row xl:items-end xl:justify-between">
			<div className="flex max-w-2xl items-start gap-3">
				<span className="mt-1 grid size-8 place-items-center rounded-lg bg-dashboard-primary-soft text-dashboard-primary"><LayoutDashboard className="size-4" /></span>
				<div>
					<h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{project.name} overview</h1>
					<p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground">A decision-ready view of feedback volume, unresolved risk, and the work that needs intervention in {project.name}.</p>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<DateRangeControl {...dates} />
				<Button variant="outline" size="lg" nativeButton={false} render={<Link href={projectPath(project.slug, "feedback")} />} className="bg-background"><Inbox data-icon="inline-start" />View feedback</Button>
				{canManageProject && <Button size="lg" nativeButton={false} render={<Link href={projectPath(project.slug, "settings")} />}><Plus data-icon="inline-start" />Project settings</Button>}
			</div>
		</header>
	);
}
