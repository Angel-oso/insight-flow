"use client";

import { useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { hasCapability, type Role } from "@/lib/auth/permissions";
import type { Project } from "@/lib/projects";
import type { FeedbackActivity, FeedbackComment, FeedbackItem } from "./data";
import { assignees, feedbackActivity, feedbackComments } from "./data";
import { FeedbackDetail, type FeedbackPermissions } from "./feedback-detail";
import { FeedbackFilters, type FeedbackFiltersState } from "./feedback-filters";
import { FeedbackList } from "./feedback-list";

const defaultFilters: FeedbackFiltersState = {
	query: "",
	status: "All statuses",
	priority: "All priorities",
	category: "All categories",
	dateRange: "Any time",
	attentionOnly: false,
};

export function FeedbackWorkspace({
	initialItems,
	project,
	role,
}: {
	readonly initialItems: readonly FeedbackItem[];
	readonly project: Project;
	readonly role: Role;
}) {
	const roleLabel =
		role === "admin" ? "Admin" : role === "manager" ? "Manager" : "Member";
	const permissions: FeedbackPermissions = {
		canTriage: hasCapability(role, "feedback.triage"),
		canAssign: hasCapability(role, "feedback.assign"),
		canUpdate: hasCapability(role, "feedback.update"),
		canComment: hasCapability(role, "feedback.comment"),
	};
	const [items, setItems] = useState<FeedbackItem[]>(() =>
		initialItems.map((item) => ({ ...item })),
	);
	const [filters, setFilters] = useState<FeedbackFiltersState>(defaultFilters);
	const [selectedId, setSelectedId] = useState<string | null>(
		initialItems[0]?.id ?? null,
	);
	const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
	const [comments, setComments] = useState<Record<string, FeedbackComment[]>>(
		() =>
			Object.fromEntries(
				Object.entries(feedbackComments).map(([id, values]) => [
					id,
					[...values],
				]),
			),
	);
	const [activities, setActivities] = useState<
		Record<string, FeedbackActivity[]>
	>(() =>
		Object.fromEntries(
			Object.entries(feedbackActivity).map(([id, values]) => [id, [...values]]),
		),
	);

	const visibleItems = useMemo(
		() =>
			items.filter((item) => {
				const searchText =
					`${item.title} ${item.description} ${item.project} ${item.sender?.name ?? ""} ${item.sender?.email ?? ""}`.toLowerCase();
				const matchesQuery = searchText.includes(
					filters.query.trim().toLowerCase(),
				);
				const matchesStatus =
					filters.status === "All statuses" || item.status === filters.status;
				const matchesPriority =
					filters.priority === "All priorities" ||
					item.priority === filters.priority;
				const matchesCategory =
					filters.category === "All categories" ||
					item.category === filters.category;
				const matchesDate =
					filters.dateRange === "Any time" ||
					(filters.dateRange === "Past 7 days" && item.ageDays <= 7) ||
					(filters.dateRange === "Past 30 days" && item.ageDays <= 30);
				const needsAttention =
					item.priority === "Critical" ||
					item.priority === "High" ||
					item.assigneeId === null ||
					item.isStale;

				return (
					matchesQuery &&
					matchesStatus &&
					matchesPriority &&
					matchesCategory &&
					matchesDate &&
					(!filters.attentionOnly || needsAttention)
				);
			}),
		[filters, items],
	);

	const selectedItem =
		visibleItems.find((item) => item.id === selectedId) ??
		visibleItems[0] ??
		null;

	const updateFeedback = (
		id: string,
		update: Partial<
			Pick<FeedbackItem, "category" | "priority" | "status" | "assigneeId">
		>,
		activity: Pick<FeedbackActivity, "message" | "tone">,
	) => {
		setItems((currentItems) =>
			currentItems.map((item) =>
				item.id === id ? { ...item, ...update, updatedAt: "Just now" } : item,
			),
		);
		setActivities((currentActivities) => ({
			...currentActivities,
			[id]: [
				{
					id: `activity-${Date.now()}`,
					message: activity.message,
					time: "Just now",
					tone: activity.tone,
				},
				...(currentActivities[id] ?? []),
			],
		}));
	};

	const addComment = (id: string, body: string) => {
		setComments((currentComments) => ({
			...currentComments,
			[id]: [
				{
					id: `comment-${Date.now()}`,
					author: "Alex Johnson",
					initials: "AJ",
					body,
					time: "Just now",
				},
				...(currentComments[id] ?? []),
			],
		}));
		setItems((currentItems) =>
			currentItems.map((item) =>
				item.id === id ? { ...item, updatedAt: "Just now" } : item,
			),
		);
		setActivities((currentActivities) => ({
			...currentActivities,
			[id]: [
				{
					id: `activity-${Date.now()}`,
					message: "Alex Johnson added an internal note",
					time: "Just now",
					tone: "primary",
				},
				...(currentActivities[id] ?? []),
			],
		}));
	};

	const selectFeedback = (id: string) => {
		setSelectedId(id);
		if (window.matchMedia("(max-width: 1023px)").matches) {
			setMobileDetailOpen(true);
		}
	};

	return (
		<section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
			<div className="border-b px-5 py-4">
				<div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">
							All feedback
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							{roleLabel} view · {project.name} triage queue and controls.
						</p>
					</div>
					<p className="text-sm text-muted-foreground">
						{visibleItems.length} of {items.length} items
					</p>
				</div>
			</div>
			<FeedbackFilters
				filters={filters}
				onFiltersChange={setFilters}
				onReset={() => setFilters(defaultFilters)}
			/>
			<div className="grid min-w-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(350px,0.65fr)]">
				<div className="min-w-0">
					<FeedbackList
						items={visibleItems}
						selectedId={selectedItem?.id ?? null}
						assignees={assignees}
						onSelect={selectFeedback}
					/>
				</div>
				<div className="hidden lg:block">
					<FeedbackDetail
						item={selectedItem}
						assignees={assignees}
						comments={selectedItem ? (comments[selectedItem.id] ?? []) : []}
						activities={selectedItem ? (activities[selectedItem.id] ?? []) : []}
						permissions={permissions}
						onUpdate={updateFeedback}
						onAddComment={addComment}
					/>
				</div>
			</div>
			<Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
				<SheetContent
					side="right"
					className="w-full max-w-none overflow-y-auto p-0 sm:max-w-none lg:hidden"
				>
					<FeedbackDetail
						item={selectedItem}
						assignees={assignees}
						comments={selectedItem ? (comments[selectedItem.id] ?? []) : []}
						activities={selectedItem ? (activities[selectedItem.id] ?? []) : []}
						permissions={permissions}
						onUpdate={updateFeedback}
						onAddComment={addComment}
					/>
				</SheetContent>
			</Sheet>
			<p className="border-t px-5 py-3 text-xs text-muted-foreground">
				Illustrative {project.name} data · Admin capabilities are wired here so
				future role scopes can reuse the same workflow.
			</p>
		</section>
	);
}
