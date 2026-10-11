import Link from "next/link";
import { ArrowRight, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { projectPath } from "@/lib/projects";
import { taxonomyColorStyle, taxonomyToneBadge } from "@/lib/taxonomy";
import type { PresentedOverview } from "./model";

export function MyWork({ mine, taxonomies, projectSlug, rangeLabel }: {
	readonly mine: PresentedOverview["mine"];
	readonly taxonomies: PresentedOverview["taxonomies"];
	readonly projectSlug: string;
	readonly rangeLabel: string;
}) {
	const priorities = new Map(taxonomies.priorities.map((item) => [item.value, item]));
	const statuses = new Map(taxonomies.statuses.map((item) => [item.value, item.label]));
	const feedbackHref = (id: string) => `${projectPath(projectSlug, "feedback")}?feedback=${id}`;
	return (
		<Card className="h-full gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="border-b px-5 py-5 sm:px-6">
				<h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">My work</h2>
				<p className="text-sm text-muted-foreground">Your next actions, ordered by priority and age.</p>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				<dl className="grid grid-cols-3 divide-x border-b px-5 py-4 sm:px-6">
					{[
						["Assigned open", mine.openCount], ["Urgent", mine.urgentCount], ["Completed", mine.completedInRange],
					].map(([label, value]) => (
						<div key={label} className="px-2 first:pl-0 last:pr-0 sm:px-4">
							<dt className="text-xs text-muted-foreground">{label}</dt>
							<dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
						</div>
					))}
				</dl>
				<p className="px-5 pt-3 text-xs text-muted-foreground sm:px-6">Completed: {rangeLabel}. Urgent: your two highest priority lanes.</p>
				<ul className="mt-3 divide-y">
					{mine.open.length === 0 ? <li className="px-5 py-6 text-sm text-muted-foreground sm:px-6">No open feedback is assigned to you.</li> : mine.open.map((item) => {
						const priority = priorities.get(item.priority);
						return (
							<li key={item.id}>
								<Link href={feedbackHref(item.id)} className="flex items-start justify-between gap-3 px-5 py-4 outline-none hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-6">
									<div className="min-w-0">
										<p className="break-words text-sm font-semibold">{item.title}</p>
										<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
											<span style={priority?.color ? taxonomyColorStyle(priority.color) : undefined} className={`rounded-md border px-1.5 py-0.5 font-medium ${priority?.color ? "" : `${taxonomyToneBadge[priority?.tone ?? "muted"]} border-transparent`}`}>
												{priority?.label ?? item.priority}
											</span>
											<span>{statuses.get(item.status) ?? item.status}</span>
											<span>Received {new Date(item.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
										</div>
									</div>
									<ArrowRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
								</Link>
							</li>
						);
					})}
				</ul>
				{mine.openCount > mine.open.length && <p className="border-t px-5 py-3 text-xs text-muted-foreground sm:px-6">Showing your first {mine.open.length} of {mine.openCount} open items.</p>}
				<div className="border-t px-5 py-4 sm:px-6">
					<h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare aria-hidden="true" className="size-4" />New comments</h3>
					<p className="mt-1 text-xs text-muted-foreground">Replies newer than your last comment.</p>
					{mine.withNewComments.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No assigned items need a reply.</p> : (
						<ul className="mt-3 space-y-2">
							{mine.withNewComments.map((item) => <li key={item.id}>
								<Link href={feedbackHref(item.id)} className="flex flex-wrap justify-between gap-x-3 gap-y-1 rounded-md py-1 text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
									<span className="break-words font-medium">{item.title}</span>
									<time dateTime={new Date(item.latestCommentAt).toISOString()} className="text-xs text-muted-foreground">{new Date(item.latestCommentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</time>
								</Link>
							</li>)}
						</ul>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
