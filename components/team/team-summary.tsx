import { CircleAlert, FolderKanban, UserRoundX, UsersRound } from "lucide-react";
import type { CSSProperties } from "react";

import type { Project } from "@/lib/projects";
import { taxonomyColorStyle } from "@/lib/taxonomy";
import type { TeamSummaryData } from "./model";

type SummaryCell = {
	readonly icon: typeof UsersRound;
	readonly className: string;
	readonly label: (summary: TeamSummaryData) => string;
	readonly context: (summary: TeamSummaryData, project: Project) => string;
	readonly style: (summary: TeamSummaryData) => CSSProperties | undefined;
};

const noStyle = () => undefined;

const cells: readonly SummaryCell[] = [
	{
		icon: UsersRound,
		className: "text-dashboard-primary",
		label: (summary: TeamSummaryData) => `${summary.memberCount} active members`,
		context: (summary: TeamSummaryData, project: Project) =>
			`${summary.coordinatorCount} can coordinate work in ${project.name}.`,
		style: noStyle,
	},
	{
		icon: FolderKanban,
		className: "text-dashboard-info",
		label: (summary: TeamSummaryData) => `${summary.openAssigned} open assignments`,
		context: (_summary: TeamSummaryData, project: Project) =>
			`Assigned work in ${project.name}.`,
		style: noStyle,
	},
	{
		icon: UserRoundX,
		className: "text-dashboard-warning-foreground",
		label: (summary: TeamSummaryData) => `${summary.unassigned} unassigned`,
		context: () => "Open feedback with no accountable owner.",
		style: noStyle,
	},
	{
		icon: CircleAlert,
		className: "text-dashboard-danger",
		label: (summary: TeamSummaryData) =>
			`${summary.critical} ${summary.criticalLabel ?? "Critical"} assignment${summary.critical === 1 ? "" : "s"}`,
		context: () => "Check these owners first.",
		style: (summary: TeamSummaryData) =>
			summary.criticalColor
				? { color: taxonomyColorStyle(summary.criticalColor).color }
				: undefined,
	},
];

export function TeamSummary({
	summary,
	project,
}: {
	readonly summary: TeamSummaryData;
	readonly project: Project;
}) {
	return (
		<section
			className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
			aria-label="Team capacity summary"
		>
			<div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
				{cells.map((cell) => (
					<div key={cell.label(summary)} className="flex items-start gap-3 bg-card p-5">
						<cell.icon
							style={cell.style(summary)}
							className={`mt-0.5 size-4 shrink-0 ${cell.className}`}
						/>
						<div>
							<p className="text-sm font-medium">{cell.label(summary)}</p>
							<p className="mt-1 text-sm text-muted-foreground">
								{cell.context(summary, project)}
							</p>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
