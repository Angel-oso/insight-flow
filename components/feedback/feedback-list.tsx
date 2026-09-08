"use client";

import {
	ArrowUpRight,
	Clock3,
	UserRoundX,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Assignee, FeedbackItem } from "./model";
import { FeedbackTag } from "./feedback-meta";

export const FEEDBACK_PAGE_SIZE = 4;

const avatarStyles = [
	"bg-dashboard-primary-soft text-dashboard-primary",
	"bg-dashboard-info-soft text-dashboard-info",
	"bg-dashboard-success-soft text-dashboard-success",
	"bg-dashboard-warning-soft text-dashboard-warning-foreground",
	"bg-muted text-muted-foreground",
] as const;

function AssigneeAvatar({
	assignee,
	index,
}: {
	readonly assignee: Assignee | undefined;
	readonly index: number;
}) {
	if (!assignee) {
		return (
			<span className="flex items-center gap-1.5 text-xs text-dashboard-warning-foreground">
				<UserRoundX className="size-3.5" />
				Unassigned
			</span>
		);
	}

	return (
		<span className="flex items-center gap-2 text-xs">
			<Avatar className="size-6">
				<AvatarFallback className={avatarStyles[index % avatarStyles.length]}>
					{assignee.initials}
				</AvatarFallback>
			</Avatar>
			<span className="truncate">{assignee.name}</span>
		</span>
	);
}

function FeedbackTitle({ item }: { readonly item: FeedbackItem }) {
	return (
		<div className="min-w-0">
			<div className="flex items-center gap-2">
				<p className="font-medium leading-5 whitespace-normal [overflow-wrap:anywhere]">
					{item.title}
				</p>
				{item.isStale ? (
					<span className="hidden shrink-0 text-xs text-dashboard-warning-foreground sm:inline">
						Stale
					</span>
				) : null}
			</div>
			<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
				<span className="text-xs text-muted-foreground">{item.project}</span>
				<span className="text-xs text-muted-foreground">·</span>
				<span className="text-xs text-muted-foreground">{item.category}</span>
			</div>
		</div>
	);
}

export function FeedbackList({
	items,
	selectedId,
	assignees,
	onSelect,
}: {
	readonly items: readonly FeedbackItem[];
	readonly selectedId: FeedbackItem["id"] | null;
	readonly assignees: readonly Assignee[];
	readonly onSelect: (id: FeedbackItem["id"]) => void;
}) {
	const assigneeById = new Map<string, Assignee>(
		assignees.map((assignee) => [assignee.id, assignee]),
	);

	if (items.length === 0) {
		return (
			<div className="flex min-h-72 flex-col items-start justify-center p-6">
				<p className="font-medium">No feedback matches these filters.</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Try a wider search or clear one of the queue filters.
				</p>
			</div>
		);
	}

	return (
		<>
			<div className="hidden overflow-x-auto lg:block">
				<table className="w-full min-w-[780px] table-fixed text-left text-sm">
					<thead className="border-b text-xs text-muted-foreground">
						<tr>
							<th className="w-[34%] px-5 py-3 font-medium">Feedback</th>
							<th className="w-[13%] px-4 py-3 font-medium">Priority</th>
							<th className="w-[14%] px-4 py-3 font-medium">Status</th>
							<th className="w-[23%] px-4 py-3 font-medium">Owner</th>
							<th className="w-[16%] px-5 py-3 text-right font-medium">
								Updated
							</th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{items.map((item, index) => {
							const isSelected = item.id === selectedId;

							return (
								<tr
									key={item.id}
									className={
										isSelected
											? "bg-dashboard-primary-soft/55"
											: "transition-colors hover:bg-muted/45"
									}
								>
									<td className="w-[34%] min-w-0 px-5 py-4">
										<button
											type="button"
											onClick={() => onSelect(item.id)}
											className="w-full text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
										>
											<FeedbackTitle item={item} />
										</button>
									</td>
									<td className="px-4 py-4">
										<FeedbackTag value={item.priority} kind="priority" />
									</td>
									<td className="px-4 py-4">
										<FeedbackTag value={item.status} kind="status" />
									</td>
									<td className="max-w-40 px-4 py-4">
										<AssigneeAvatar
											assignee={assigneeById.get(item.assigneeId ?? "")}
											index={index}
										/>
									</td>
									<td className="px-5 py-4 text-right text-xs text-muted-foreground">
										<span className="inline-flex items-center gap-1">
											<Clock3 className="size-3" />
											{item.updatedAt}
										</span>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			<div className="divide-y lg:hidden">
				{items.map((item) => {
					const isSelected = item.id === selectedId;

					return (
						<button
							key={item.id}
							type="button"
							onClick={() => onSelect(item.id)}
							className={`w-full px-5 py-4 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
								isSelected
									? "bg-dashboard-primary-soft/55"
									: "hover:bg-muted/45"
							}`}
						>
							<div className="flex items-start justify-between gap-3">
								<FeedbackTitle item={item} />
								<ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							</div>
							<div className="mt-3 flex flex-wrap items-center gap-2">
								<FeedbackTag value={item.priority} kind="priority" />
								<FeedbackTag value={item.status} kind="status" />
								<span className="ml-auto text-xs text-muted-foreground">
									{item.updatedAt}
								</span>
							</div>
						</button>
					);
				})}
			</div>
		</>
	);
}
