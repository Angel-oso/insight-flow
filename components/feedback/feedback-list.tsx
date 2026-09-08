"use client";

import { ChevronDown, Clock3, UserRoundX } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Taxonomies } from "@/lib/taxonomy";
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
		<span className="flex min-w-0 items-center gap-2 text-xs">
			<Avatar className="size-6 shrink-0">
				<AvatarFallback className={avatarStyles[index % avatarStyles.length]}>
					{assignee.initials}
				</AvatarFallback>
			</Avatar>
			<span className="max-w-32 truncate">{assignee.name}</span>
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
					<span className="shrink-0 text-xs text-dashboard-warning-foreground">
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
	taxonomies,
	onSelect,
	renderDetail,
}: {
	readonly items: readonly FeedbackItem[];
	readonly selectedId: FeedbackItem["id"] | null;
	readonly assignees: readonly Assignee[];
	readonly taxonomies: Taxonomies;
	readonly onSelect: (id: FeedbackItem["id"]) => void;
	readonly renderDetail: (item: FeedbackItem) => React.ReactNode;
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
		<div className="divide-y">
			{items.map((item, index) => {
				const isSelected = item.id === selectedId;
				const panelId = `feedback-panel-${item.id}`;

				return (
					<div
						key={item.id}
						className={isSelected ? "bg-dashboard-primary-soft/30" : undefined}
					>
						<button
							type="button"
							onClick={() => onSelect(item.id)}
							aria-expanded={isSelected}
							aria-controls={panelId}
							className="w-full px-5 py-4 text-left outline-none transition-colors hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
						>
							<span className="flex flex-col gap-3 lg:flex-row lg:items-center">
								<span className="min-w-0 flex-1">
									<FeedbackTitle item={item} />
								</span>
								<span className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:ml-auto lg:shrink-0 lg:justify-end">
									<FeedbackTag value={item.priority} kind="priority" taxonomies={taxonomies} />
									<FeedbackTag value={item.status} kind="status" taxonomies={taxonomies} />
									<AssigneeAvatar
										assignee={assigneeById.get(item.assigneeId ?? "")}
										index={index}
									/>
									<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
										<Clock3 className="size-3" />
										{item.updatedAt}
									</span>
									<ChevronDown
										className={`size-4 shrink-0 text-muted-foreground transition-transform ${isSelected ? "rotate-180" : ""}`}
									/>
								</span>
							</span>
						</button>
						{isSelected ? (
							<div id={panelId} role="region" className="border-t">
								{renderDetail(item)}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
