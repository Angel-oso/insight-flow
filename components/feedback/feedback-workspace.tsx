"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { hasCapability, type Role } from "@/lib/auth/permissions";
import type { Project } from "@/lib/projects";
import {
	finalStatusValues,
	taxonomyItemFor,
	type Taxonomies,
} from "@/lib/taxonomy";
import type { Assignee, FeedbackItem } from "./model";
import { useFeedbackDetail, useFeedbackWrites } from "./use-feedback";
import { FeedbackDetail, type FeedbackPermissions } from "./feedback-detail";
import { FeedbackFilters, type FeedbackFiltersState } from "./feedback-filters";
import { FEEDBACK_PAGE_SIZE, FeedbackList } from "./feedback-list";

const defaultFilters: FeedbackFiltersState = {
	query: "",
	status: "All statuses",
	priority: "All priorities",
	category: "All categories",
	dateRange: "Any time",
	attentionOnly: false,
};

export function FeedbackWorkspace({
	items,
	assignees,
	taxonomies,
	now,
	archived,
	project,
	role,
}: {
	readonly items: readonly FeedbackItem[];
	readonly assignees: readonly Assignee[];
	readonly taxonomies: Taxonomies;
	readonly now: number;
	readonly archived: boolean;
	readonly project: Project;
	readonly role: Role;
}) {
	const roleLabel =
		role === "admin" ? "Admin" : role === "manager" ? "Manager" : "Member";
	const { pending, error, updateFeedback, addComment } = useFeedbackWrites(
		project.slug,
	);
	const permissions: FeedbackPermissions = {
		canTriage: !archived && !pending && hasCapability(role, "feedback.triage"),
		canAssign: !archived && !pending && hasCapability(role, "feedback.assign"),
		canUpdate: !archived && !pending && hasCapability(role, "feedback.update"),
		canComment:
			!archived && !pending && hasCapability(role, "feedback.comment"),
	};
	const [filters, setFilters] = useState<FeedbackFiltersState>(defaultFilters);
	const [selectedId, setSelectedId] = useQueryState("feedback", parseAsString);
	const finals = useMemo(() => finalStatusValues(taxonomies), [taxonomies]);
	// Severity lane = highest rank present in the open backlog.
	const laneRank = useMemo(() => {
		let lane = -1;
		for (const item of items) {
			if (finals.has(item.status)) continue;
			const rank = taxonomyItemFor(taxonomies.priorities, item.priority).rank;
			if (rank > lane) lane = rank;
		}
		return lane;
	}, [items, finals, taxonomies]);
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
					!finals.has(item.status) &&
					(taxonomyItemFor(taxonomies.priorities, item.priority).rank >=
						laneRank - 2 ||
						item.assigneeId === null ||
						item.isStale);

				return (
					matchesQuery &&
					matchesStatus &&
					matchesPriority &&
					matchesCategory &&
					matchesDate &&
					(!filters.attentionOnly || needsAttention)
				);
			}),
		[filters, items, finals, laneRank, taxonomies],
	);

	const selectedItem = items.find((item) => item.id === selectedId) ?? null;
	const [pageState, setPageState] = useState(() => {
		const selectedIndex = visibleItems.findIndex(
			(item) => item.id === selectedId,
		);
		return {
			page:
				selectedIndex === -1
					? 1
					: Math.floor(selectedIndex / FEEDBACK_PAGE_SIZE) + 1,
			selectedId,
		};
	});
	const pageCount = Math.max(
		1,
		Math.ceil(visibleItems.length / FEEDBACK_PAGE_SIZE),
	);
	const selectedPage =
		pageState.selectedId === selectedId
			? null
			: (() => {
				const selectedIndex = visibleItems.findIndex(
					(item) => item.id === selectedId,
				);
				return selectedIndex === -1
					? 1
					: Math.floor(selectedIndex / FEEDBACK_PAGE_SIZE) + 1;
			})();
	const page = Math.min(selectedPage ?? pageState.page, pageCount);
	const paginatedItems = useMemo(
		() =>
			visibleItems.slice(
				(page - 1) * FEEDBACK_PAGE_SIZE,
				page * FEEDBACK_PAGE_SIZE,
			),
		[page, visibleItems],
	);
	const detail = useFeedbackDetail(
		project.slug,
		selectedItem?.id ?? null,
		project.name,
		now,
		finals,
	);
	const detailItem = detail?.item ?? selectedItem;

	useEffect(() => {
		if (selectedId !== null && !selectedItem) void setSelectedId(null);
	}, [selectedId, selectedItem, setSelectedId]);

	const updateFilters = (nextFilters: FeedbackFiltersState) => {
		setFilters(nextFilters);
		setPageState({ page: 1, selectedId });
	};

	const selectFeedback = (id: FeedbackItem["id"]) => {
		if (id === selectedId) {
			void setSelectedId(null);
			setPageState({ page, selectedId: null });
			return;
		}
		void setSelectedId(id);
		const selectedIndex = visibleItems.findIndex((item) => item.id === id);
		setPageState({
			page:
				selectedIndex === -1
					? 1
					: Math.floor(selectedIndex / FEEDBACK_PAGE_SIZE) + 1,
			selectedId: id,
		});
	};

	const handlePageChange = (nextPage: number) => {
		setPageState({ page: nextPage, selectedId });
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
			{error ? (
				<p role="alert" className="px-5 py-3 text-destructive">
					{error}
				</p>
			) : null}
			{archived ? (
				<p className="px-5 py-3 text-muted-foreground">
					This project is archived. Feedback is read-only.
				</p>
			) : null}
			<FeedbackFilters
				filters={filters}
				taxonomies={taxonomies}
				onFiltersChange={updateFilters}
				onReset={() => updateFilters(defaultFilters)}
				page={page}
				pageCount={pageCount}
				pageSize={FEEDBACK_PAGE_SIZE}
				totalItems={visibleItems.length}
				onPageChange={handlePageChange}
			/>
			<div className="min-w-0">
				<FeedbackList
					items={paginatedItems}
					selectedId={selectedItem?.id ?? null}
					assignees={assignees}
					taxonomies={taxonomies}
					onSelect={selectFeedback}
					renderDetail={(item) => (
						<FeedbackDetail
							key={item.id}
							item={detailItem ?? item}
							loading={Boolean(selectedItem) && !detail}
							pending={pending}
							assignees={assignees}
							comments={detail?.comments ?? []}
							activities={detail?.activities ?? []}
							permissions={permissions}
							taxonomies={taxonomies}
							laneRank={laneRank}
							onUpdate={updateFeedback}
							onAddComment={addComment}
						/>
					)}
				/>
			</div>
			<p className="border-t px-5 py-3 text-xs text-muted-foreground">
				Team workspace · Changes are saved automatically.
			</p>
		</section>
	);
}
