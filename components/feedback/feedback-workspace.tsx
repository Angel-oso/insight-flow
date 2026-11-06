"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { hasCapability, type Capability } from "@/lib/auth/permissions";
import type { Project } from "@/lib/projects";
import { finalStatusValues, type Taxonomies } from "@/lib/taxonomy";
import type { Id } from "@/convex/_generated/dataModel";
import { presentFeedback, type Assignee } from "./model";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
	FEEDBACK_LOAD_BATCH,
	MAX_BULK_DELETE,
	useDebouncedValue,
	useFeedbackDeletion,
	useFeedbackDetail,
	useFeedbackPage,
	useFeedbackWrites,
	useSelectedFeedback,
	type FeedbackListFilters,
} from "./use-feedback";
import { FeedbackDetail, type FeedbackPermissions } from "./feedback-detail";
import { FeedbackFilters, type FeedbackFiltersState } from "./feedback-filters";
import { FEEDBACK_PAGE_SIZE, FeedbackList } from "./feedback-list";
import { LogFeedback } from "./log-feedback";

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

const defaultFilters: FeedbackFiltersState = {
	query: "",
	status: "All statuses",
	priority: "All priorities",
	category: "All categories",
	dateRange: "Any time",
	attentionOnly: false,
	mineOnly: false,
};

function hasActiveFilters(filters: FeedbackFiltersState) {
	return (
		filters.query.trim().length > 0 ||
		filters.status !== "All statuses" ||
		filters.priority !== "All priorities" ||
		filters.category !== "All categories" ||
		filters.dateRange !== "Any time" ||
		filters.attentionOnly ||
		filters.mineOnly
	);
}

/**
 * Maps UI filters to the server query. Time-based filters use the clock
 * rounded down to the hour so the subscription (and its loaded pages) is
 * not reset every minute.
 */
function toServerFilters(
	filters: FeedbackFiltersState,
	search: string,
	now: number,
): FeedbackListFilters {
	const hour = Math.floor(now / hourMs) * hourMs;
	const days =
		filters.dateRange === "Past 7 days"
			? 7
			: filters.dateRange === "Past 30 days"
				? 30
				: null;
	return {
		...(search.trim() ? { search: search.trim() } : {}),
		...(filters.status !== "All statuses" ? { status: filters.status } : {}),
		...(filters.priority !== "All priorities"
			? { priority: filters.priority }
			: {}),
		...(filters.category !== "All categories"
			? { category: filters.category }
			: {}),
		...(filters.mineOnly ? { assignee: "me" as const } : {}),
		...(days !== null ? { receivedAfter: hour - days * dayMs } : {}),
		...(filters.attentionOnly ? { attention: { now: hour } } : {}),
	};
}

export function FeedbackWorkspace({
	assignees,
	taxonomies,
	totalItems,
	laneRank,
	now,
	archived,
	project,
	role,
	grantedPermissions,
	viewerId,
	defaultPriority,
}: {
	readonly viewerId: Id<"users"> | null;
	readonly defaultPriority: string;
	readonly assignees: readonly Assignee[];
	readonly taxonomies: Taxonomies;
	/** Every item in the project (aggregate count). */
	readonly totalItems: number;
	/** Severity lane = highest rank present in the open backlog. */
	readonly laneRank: number;
	readonly now: number;
	readonly archived: boolean;
	readonly project: Project;
	readonly role: string;
	readonly grantedPermissions: readonly Capability[];
}) {
	const roleLabel =
		role === "admin" ? "Admin" : role === "manager" ? "Manager" : role;
	const { pending, error, updateFeedback, addComment } = useFeedbackWrites(
		project.slug,
	);
	const permissions: FeedbackPermissions = {
		canTriage:
			!archived && !pending && hasCapability(grantedPermissions, "feedback.triage"),
		canAssign:
			!archived && !pending && hasCapability(grantedPermissions, "feedback.assign"),
		canUpdate:
			!archived && !pending && hasCapability(grantedPermissions, "feedback.update"),
		canComment:
			!archived && !pending && hasCapability(grantedPermissions, "feedback.comment"),
		canDelete: !archived && hasCapability(grantedPermissions, "project.manage"),
	};
	const { deleteOne, deleteMany } = useFeedbackDeletion(project.slug);
	const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
	const [confirmingBulk, setConfirmingBulk] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const toggleChecked = (id: Id<"feedback">) =>
		setChecked((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else if (next.size < MAX_BULK_DELETE) next.add(id);
			return next;
		});
	// Members start on their own queue; triagers start on the whole inbox.
	const [filters, setFilters] = useState<FeedbackFiltersState>(() => ({
		...defaultFilters,
		mineOnly:
			viewerId !== null && !hasCapability(grantedPermissions, "feedback.triage"),
	}));
	const canLog = !archived && hasCapability(grantedPermissions, "feedback.triage");
	const [selectedId, setSelectedId] = useQueryState("feedback", parseAsString);
	const finals = useMemo(() => finalStatusValues(taxonomies), [taxonomies]);

	const search = useDebouncedValue(filters.query);
	const serverFilters = useMemo(
		() => toServerFilters(filters, search, now),
		[filters, search, now],
	);
	const { results, status, loadMore } = useFeedbackPage(
		project.slug,
		serverFilters,
	);
	const items = useMemo(
		() =>
			results.map((item) => presentFeedback(item, project.name, now, finals)),
		[results, project.name, now, finals],
	);
	const canLoadMore = status === "CanLoadMore";
	const hasMore = canLoadMore || status === "LoadingMore";

	const [requestedPage, setPage] = useState(1);
	const pageCount = Math.max(1, Math.ceil(items.length / FEEDBACK_PAGE_SIZE));
	// Loaded pages can shrink (filters, reactive updates): stay in range,
	// but allow sitting on the page that is being fetched.
	const page = Math.min(requestedPage, hasMore ? pageCount + 1 : pageCount);
	const pageItems = useMemo(
		() =>
			items.slice((page - 1) * FEEDBACK_PAGE_SIZE, page * FEEDBACK_PAGE_SIZE),
		[items, page],
	);

	// The server caps rows scanned per page (maximumRowsRead), so selective
	// filters can return short or empty batches that still have more behind
	// them. Keep fetching until the visible page is full or results run out.
	useEffect(() => {
		if (canLoadMore && pageItems.length < FEEDBACK_PAGE_SIZE)
			loadMore(FEEDBACK_LOAD_BATCH);
	}, [canLoadMore, pageItems.length, loadMore]);

	// The selected item may live outside the loaded pages (deep links from
	// the overview or notifications): resolve it on its own.
	const selected = useSelectedFeedback(project.slug, selectedId);
	const selectedItem = useMemo(() => {
		if (!selectedId) return null;
		const loaded = items.find((item) => item.id === selectedId);
		if (loaded) return loaded;
		return selected ? presentFeedback(selected, project.name, now, finals) : null;
	}, [selectedId, items, selected, project.name, now, finals]);
	const visibleItems = useMemo(
		() =>
			selectedItem && !pageItems.some((item) => item.id === selectedItem.id)
				? [selectedItem, ...pageItems]
				: pageItems,
		[pageItems, selectedItem],
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
		// Unknown, malformed or other-project ids clear the deep link.
		if (selectedId !== null && selected === null) void setSelectedId(null);
	}, [selectedId, selected, setSelectedId]);

	// A new filter set or search starts a new result list: drop the bulk
	// selection so it never deletes items the user can no longer see. Paging
	// within the same filters keeps it.
	const updateFilters = (nextFilters: FeedbackFiltersState) => {
		setFilters(nextFilters);
		setPage(1);
		setChecked((current) => (current.size === 0 ? current : new Set()));
	};

	const selectFeedback = (id: Id<"feedback">) => {
		void setSelectedId(id === selectedId ? null : id);
	};

	const handlePageChange = (nextPage: number) => {
		// Clamp here too: repeated clicks while a batch loads must not run
		// requestedPage past the page being fetched.
		setPage(
			Math.max(1, Math.min(nextPage, hasMore ? pageCount + 1 : pageCount)),
		);
		// Fetch ahead when the next page reaches past what is loaded.
		if (nextPage * FEEDBACK_PAGE_SIZE >= items.length && canLoadMore)
			loadMore(FEEDBACK_LOAD_BATCH);
	};

	const deleteSelected = async () => {
		const ids = [...checked] as Id<"feedback">[];
		const deleted = await deleteMany(ids);
		setChecked(new Set());
		if (selectedId && ids.includes(selectedId as Id<"feedback">)) void setSelectedId(null);
		setNotice(`Deleted ${deleted} feedback ${deleted === 1 ? "item" : "items"}.`);
	};

	const deleteSelectedItem = async (id: Id<"feedback">) => {
		await deleteOne(id);
		setChecked((current) => {
			if (!current.has(id)) return current;
			const next = new Set(current);
			next.delete(id);
			return next;
		});
		void setSelectedId(null);
		setNotice("Feedback deleted.");
	};

	const filtered = hasActiveFilters(filters);
	const checkedOnPage = pageItems.reduce(
		(count, item) => (checked.has(item.id) ? count + 1 : count),
		0,
	);
	const checkedElsewhere = checked.size - checkedOnPage;
	const checkedLabel = `${checked.size} feedback ${checked.size === 1 ? "item" : "items"} selected`;
	const matchLabel = `${items.length}${hasMore ? "+" : ""}`;

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
					<div className="flex items-center gap-3">
						<p className="text-sm text-muted-foreground">
							{status === "LoadingFirstPage"
								? `${totalItems} items`
								: filtered
									? `${matchLabel} of ${totalItems} items`
									: `${totalItems} items`}
						</p>
						{canLog ? (
							<LogFeedback
								projectSlug={project.slug}
								defaultPriority={defaultPriority}
								taxonomies={taxonomies}
								onLogged={(feedbackId) => {
									updateFilters(defaultFilters);
									void setSelectedId(feedbackId);
								}}
							/>
						) : null}
					</div>
				</div>
			</div>
			{error ? (
				<p role="alert" className="px-5 py-3 text-destructive">
					{error}
				</p>
			) : null}
			{notice ? (
				<p role="status" className="px-5 py-3 text-dashboard-success">
					{notice}
				</p>
			) : null}
			{archived ? (
				<p className="px-5 py-3 text-muted-foreground">
					This project is archived. Feedback is read-only.
				</p>
			) : null}
			{permissions.canDelete && checked.size > 0 ? (
				<div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-5 py-2.5">
					<p className="text-sm" role="status">
						{checkedLabel}
						{checkedElsewhere > 0
							? ` (${checkedElsewhere} on other pages)`
							: ""}
						{checked.size >= MAX_BULK_DELETE ? ` Â· maximum ${MAX_BULK_DELETE}` : ""}
					</p>
					<div className="flex items-center gap-2">
						<Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
							Clear selection
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => {
								setNotice(null);
								setConfirmingBulk(true);
							}}
						>
							<Trash2 data-icon="inline-start" />
							Delete {checked.size} selected
						</Button>
					</div>
				</div>
			) : null}
			<ConfirmDialog
				open={confirmingBulk}
				onOpenChange={setConfirmingBulk}
				title={`Delete ${checked.size} feedback ${checked.size === 1 ? "item" : "items"}?`}
				description="The selected items are removed with their internal notes and activity. Use this for spam and duplicates; it cannot be undone."
				confirmLabel="Delete feedback"
				pendingLabel="Deleting…"
				onConfirm={deleteSelected}
			/>
			<FeedbackFilters
				canFilterMine={viewerId !== null}
				filters={filters}
				taxonomies={taxonomies}
				onFiltersChange={updateFilters}
				onReset={() => updateFilters(defaultFilters)}
				page={page}
				pageCount={pageCount}
				hasMore={hasMore}
				loadingMore={status === "LoadingMore"}
				pageSize={FEEDBACK_PAGE_SIZE}
				loadedItems={items.length}
				onPageChange={handlePageChange}
			/>
			<div className="min-w-0">
				<FeedbackList
					items={visibleItems}
					loading={
						status === "LoadingFirstPage" ||
						(status === "LoadingMore" && pageItems.length === 0)
					}
					selectedId={selectedItem?.id ?? null}
					assignees={assignees}
					taxonomies={taxonomies}
					onSelect={selectFeedback}
					selection={
						permissions.canDelete
							? { checked, onToggle: toggleChecked }
							: undefined
					}
					renderDetail={(item) => (
						<FeedbackDetail
							key={item.id}
							item={detailItem ?? item}
							loading={Boolean(selectedItem) && !detail}
							pending={pending}
							assignees={assignees}
							comments={detail?.comments ?? []}
							activities={detail?.activities ?? []}
							olderComments={detail?.olderComments}
							olderActivities={detail?.olderActivities}
							permissions={permissions}
							taxonomies={taxonomies}
							laneRank={laneRank}
							onUpdate={updateFeedback}
							onAddComment={addComment}
							onDelete={deleteSelectedItem}
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
