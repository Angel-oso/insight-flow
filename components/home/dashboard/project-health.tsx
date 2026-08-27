import { ChevronRight, FolderKanban, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { projects } from "./data";
import { SectionHeading } from "./section-heading";

export function ProjectHealth() {
	return (
		<Card className="py-0 shadow-sm">
			<CardHeader className="px-4 pt-3">
				<SectionHeading title="Project health" />
			</CardHeader>
			<CardContent className="overflow-x-auto px-3 pb-3">
				<table className="w-full min-w-[610px] text-left text-[10px]">
					<thead className="border-y bg-muted/40 text-muted-foreground">
						<tr>
							<th className="px-2 py-2 font-medium">Project</th>
							<th className="px-2 py-2 font-medium">
								Received <Info className="inline size-2.5" />
							</th>
							<th className="px-2 py-2 font-medium">
								Open <Info className="inline size-2.5" />
							</th>
							<th className="px-2 py-2 font-medium">
								Critical <Info className="inline size-2.5" />
							</th>
							<th className="px-2 py-2 font-medium">
								Resolution rate <Info className="inline size-2.5" />
							</th>
							<th className="px-2 py-2 font-medium">Last activity</th>
							<th className="px-2 py-2 font-medium">Health</th>
						</tr>
					</thead>
					<tbody>
						{projects.map((project) => (
							<tr className="border-b last:border-0" key={project.name}>
								<td className="px-2 py-2 font-medium">
									<span className="mr-1.5 inline-grid size-5 place-items-center rounded border border-dashboard-primary/20 bg-dashboard-primary-soft align-middle text-dashboard-primary">
										<FolderKanban className="size-3" />
									</span>
									{project.name}
								</td>
								<td className="px-2 py-2">{project.received}</td>
								<td className="px-2 py-2">{project.open}</td>
								<td className="px-2 py-2 text-dashboard-danger">
									{project.critical}
								</td>
								<td className="px-2 py-2">
									{project.resolution}{" "}
									<span
										className={
											project.change.startsWith("+")
												? "text-dashboard-success"
												: "text-dashboard-danger"
										}
									>
										{project.change}
									</span>
								</td>
								<td className="px-2 py-2 text-muted-foreground">
									{project.activity}
								</td>
								<td className="px-2 py-2">
									<span
										className={
											project.health === "Good"
												? "rounded border border-dashboard-success/30 bg-dashboard-success-soft px-2 py-0.5 text-dashboard-success"
												: "rounded border border-dashboard-warning/30 bg-dashboard-warning-soft px-2 py-0.5 text-dashboard-warning"
										}
									>
										{project.health}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<Button
					variant="link"
					size="xs"
					className="mt-2 h-auto px-0 text-dashboard-primary"
				>
					View all projects <ChevronRight />
				</Button>
			</CardContent>
		</Card>
	);
}
