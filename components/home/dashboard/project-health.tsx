import {
	ArrowRight,
	CircleAlert,
	CircleCheck,
	CircleDotDashed,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { DashboardProjectHealth } from "./data";

const healthStyles = {
	"At risk": {
		className: "bg-dashboard-danger-soft text-dashboard-danger",
		icon: CircleAlert,
	},
	"Needs attention": {
		className: "bg-dashboard-warning-soft text-dashboard-warning-foreground",
		icon: CircleDotDashed,
	},
	Healthy: {
		className: "bg-dashboard-success-soft text-dashboard-success",
		icon: CircleCheck,
	},
};

export function ProjectHealth({
	project: activeProject,
}: {
	readonly project: DashboardProjectHealth;
}) {
	const projects = [activeProject];

	return (
		<Card className="gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="flex flex-row items-start justify-between border-b px-5 py-5 sm:px-6">
				<div>
					<h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">
						Project health
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Transparent health rules based on critical items and open backlog.
					</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					className="hidden sm:inline-flex"
					disabled
				>
					Open feedback <ArrowRight data-icon="inline-end" />
				</Button>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				<div className="hidden overflow-x-auto md:block">
					<table className="w-full min-w-[720px] text-left text-sm">
						<thead>
							<tr className="border-b bg-muted/35 text-xs text-muted-foreground">
								<th className="px-6 py-3 font-medium">Project</th>
								<th className="px-4 py-3 text-right font-medium">Received</th>
								<th className="px-4 py-3 text-right font-medium">Open</th>
								<th className="px-4 py-3 text-right font-medium">Critical</th>
								<th className="px-4 py-3 text-right font-medium">Resolution</th>
								<th className="px-4 py-3 font-medium">Last activity</th>
								<th className="px-6 py-3 font-medium">Health</th>
							</tr>
						</thead>
						<tbody>
							{projects.map((project) => {
								const health = healthStyles[project.health];
								const HealthIcon = health.icon;
								return (
									<tr
										key={project.name}
										className="border-b last:border-0 hover:bg-muted/35"
									>
										<td className="px-6 py-4 font-semibold">{project.name}</td>
										<td className="px-4 py-4 text-right tabular-nums">
											{project.received}
										</td>
										<td className="px-4 py-4 text-right tabular-nums">
											{project.open}
										</td>
										<td className="px-4 py-4 text-right font-semibold text-dashboard-danger tabular-nums">
											{project.critical}
										</td>
										<td className="px-4 py-4 text-right tabular-nums">
											{project.resolution}
										</td>
										<td className="px-4 py-4 text-muted-foreground">
											{project.activity}
										</td>
										<td className="px-6 py-4">
											<span
												className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${health.className}`}
											>
												<HealthIcon className="size-3.5" />
												{project.health}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
				<div className="divide-y md:hidden">
					{projects.map((project) => {
						const health = healthStyles[project.health];
						const HealthIcon = health.icon;
						return (
							<article key={project.name} className="p-5">
								<div className="flex items-start justify-between gap-3">
									<div>
										<h3 className="font-semibold">{project.name}</h3>
										<p className="mt-1 text-xs text-muted-foreground">
											Updated {project.activity}
										</p>
									</div>
									<span
										className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${health.className}`}
									>
										<HealthIcon className="size-3" />
										{project.health}
									</span>
								</div>
								<dl className="mt-4 grid grid-cols-4 gap-2">
									<div>
										<dt className="text-[10px] text-muted-foreground">
											Received
										</dt>
										<dd className="mt-1 text-sm font-semibold tabular-nums">
											{project.received}
										</dd>
									</div>
									<div>
										<dt className="text-[10px] text-muted-foreground">Open</dt>
										<dd className="mt-1 text-sm font-semibold tabular-nums">
											{project.open}
										</dd>
									</div>
									<div>
										<dt className="text-[10px] text-muted-foreground">
											Critical
										</dt>
										<dd className="mt-1 text-sm font-semibold text-dashboard-danger tabular-nums">
											{project.critical}
										</dd>
									</div>
									<div>
										<dt className="text-[10px] text-muted-foreground">
											Resolved
										</dt>
										<dd className="mt-1 text-sm font-semibold tabular-nums">
											{project.resolution}
										</dd>
									</div>
								</dl>
							</article>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
