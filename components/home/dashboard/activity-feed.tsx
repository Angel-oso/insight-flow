import { Check, Circle, MessageSquare, MoveRight } from "lucide-react";

import Link from "next/link";
import { projectPath } from "@/lib/projects";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { OverviewActivity } from "./model";

const avatarStyles = {
	primary: "bg-dashboard-primary-soft text-dashboard-primary",
	neutral: "bg-muted text-foreground",
	success: "bg-dashboard-success-soft text-dashboard-success",
	warning: "bg-dashboard-warning-soft text-dashboard-warning-foreground",
};

const activityIcons = {
	primary: MoveRight,
	neutral: MessageSquare,
	success: Check,
	warning: Circle,
};

export function ActivityFeed({
	activities,
}: {
	readonly activities: readonly OverviewActivity[];
}) {
	return (
		<Card className="flex h-full flex-col gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="border-b px-5 py-5">
				<h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">
					Recent activity
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Changes with the greatest operational relevance.
				</p>
			</CardHeader>
			<CardContent className="flex min-h-0 flex-1 flex-col p-5">
				<ol className="max-h-[26rem] min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
					{activities.length > 0 ? (
						activities.map((activity) => {
							const ActivityIcon = activityIcons[activity.tone];
							return (
								<li key={activity.id} className="flex gap-3">
									<Avatar className="size-8 rounded-lg">
										<AvatarFallback
											className={`rounded-lg text-[10px] font-semibold ${avatarStyles[activity.tone]}`}
										>
											{activity.initials}
										</AvatarFallback>
									</Avatar>
									<div className="min-w-0 flex-1">
										<p className="text-sm leading-5">
											<span className="font-semibold">{activity.actor}</span>{" "}
											{activity.projectSlug ? <Link className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary" href={activity.feedbackId ? `${projectPath(activity.projectSlug, "feedback")}?feedback=${activity.feedbackId}` : projectPath(activity.projectSlug, "home")}>{activity.action}</Link> : activity.action}
										</p>
										<p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
											<ActivityIcon className="size-3" />
											{activity.project}
											<span aria-hidden="true">·</span>
											{activity.time}
										</p>
									</div>
								</li>
							);
						})
					) : (
						<li className="text-sm text-muted-foreground">No activity yet.</li>
					)}
				</ol>
			</CardContent>
		</Card>
	);
}
