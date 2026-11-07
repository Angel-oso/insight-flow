import { TableAggregate } from "@convex-dev/aggregate";
import type { Value } from "convex/values";
import { components } from "../_generated/api";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Feedback metrics without reading every row. Each aggregate is namespaced
 * per project (no cross-project contention) and keyed by RAW stored values:
 * statuses' `isFinal` and priority ranks are editable taxonomies, so
 * "open", "critical" and "urgent" are derived at read time and a taxonomy
 * edit never requires rewriting aggregate data.
 *
 * Writes: never call these directly from a mutation. Every insert, patch
 * and delete of the feedback table goes through convex/feedback/store.ts,
 * which keeps all of them in sync in the same transaction.
 */
type FeedbackAggregate<Key extends Value> = TableAggregate<{
	Namespace: Id<"projects">;
	Key: Key;
	DataModel: DataModel;
	TableName: "feedback";
}>;

type FeedbackDoc = Doc<"feedback">;

/** Sort keys, shared by the aggregates and the store's change detection. */
const keys = {
	received: (doc: FeedbackDoc) => doc.receivedAt,
	completed: (doc: FeedbackDoc) => doc.completedAt ?? null,
	status: (doc: FeedbackDoc): [string, string] => [doc.status, doc.priority],
	category: (doc: FeedbackDoc) => doc.category,
	assignee: (doc: FeedbackDoc): [Id<"users"> | null, string, string] => [doc.assigneeId, doc.status, doc.priority],
	assigneeCompleted: (doc: FeedbackDoc): [Id<"users"> | null, number | null] => [doc.assigneeId, doc.completedAt ?? null],
};
const namespace = (doc: FeedbackDoc) => doc.projectId;

/** Received volume, date windows, daily trend and the project total. */
export const feedbackByReceived: FeedbackAggregate<number> = new TableAggregate(
	components.feedbackByReceived,
	{ namespace, sortKey: keys.received },
);

/** Completions by date (null while not completed). */
export const feedbackByCompleted: FeedbackAggregate<number | null> = new TableAggregate(
	components.feedbackByCompleted,
	{ namespace, sortKey: keys.completed },
);

/** Status distribution and the open backlog per priority. */
export const feedbackByStatus: FeedbackAggregate<[string, string]> = new TableAggregate(
	components.feedbackByStatus,
	{ namespace, sortKey: keys.status },
);

/** Category distribution. */
export const feedbackByCategory: FeedbackAggregate<string> = new TableAggregate(
	components.feedbackByCategory,
	{ namespace, sortKey: keys.category },
);

/** Workload per assignee (null = unassigned) by status and priority. */
export const feedbackByAssignee: FeedbackAggregate<[Id<"users"> | null, string, string]> =
	new TableAggregate(components.feedbackByAssignee, { namespace, sortKey: keys.assignee });

/** Completions per assignee by date. */
export const feedbackByAssigneeCompleted: FeedbackAggregate<[Id<"users"> | null, number | null]> =
	new TableAggregate(components.feedbackByAssigneeCompleted, {
		namespace,
		sortKey: keys.assigneeCompleted,
	});

/**
 * Every aggregate mirrored from the feedback table, with its sort key (used
 * by convex/feedback/store.ts to skip aggregates a patch did not move).
 */
type MirroredAggregate = {
	readonly aggregate: {
		insertIfDoesNotExist(ctx: MutationCtx, doc: FeedbackDoc): Promise<void>;
		replaceOrInsert(ctx: MutationCtx, before: FeedbackDoc, after: FeedbackDoc): Promise<void>;
		deleteIfExists(ctx: MutationCtx, doc: FeedbackDoc): Promise<void>;
	};
	readonly entry: (doc: FeedbackDoc) => unknown;
};
export const FEEDBACK_AGGREGATES: readonly MirroredAggregate[] = [
	{ aggregate: feedbackByReceived, entry: keys.received },
	{ aggregate: feedbackByCompleted, entry: keys.completed },
	{ aggregate: feedbackByStatus, entry: keys.status },
	{ aggregate: feedbackByCategory, entry: keys.category },
	{ aggregate: feedbackByAssignee, entry: keys.assignee },
	{ aggregate: feedbackByAssigneeCompleted, entry: keys.assigneeCompleted },
];

type Taxonomy = { value: string; rank: number };

/** Half-open [start, end) numeric window bounds. */
function windowBounds(start: number, end: number) {
	return {
		lower: { key: start, inclusive: true },
		upper: { key: end, inclusive: false },
	};
}

/**
 * Project backlog from the status×priority aggregate. `open` counts every
 * non-final item (unknown statuses count as open, like the old row scan);
 * `openByPriority` covers known taxonomy values. The "lane" is the highest
 * priority rank present in the open backlog (-1 when empty).
 */
export async function projectBacklog(
	ctx: QueryCtx,
	projectId: Id<"projects">,
	taxonomies: { statuses: readonly Taxonomy[]; priorities: readonly Taxonomy[] },
	finals: ReadonlySet<string>,
) {
	const statuses = taxonomies.statuses.map((entry) => entry.value);
	const priorities = taxonomies.priorities.map((entry) => entry.value);
	const [total, statusCounts] = await Promise.all([
		feedbackByReceived.count(ctx, { namespace: projectId }),
		feedbackByStatus.countBatch(
			ctx,
			statuses.map((status) => ({ namespace: projectId, bounds: { prefix: [status] as [string] } })),
		),
	]);
	const byStatus = new Map(statuses.map((status, index) => [status, statusCounts[index]]));
	// Priority split only for open statuses that hold items: final and empty
	// statuses never contribute, so the pair reads stay well under
	// open statuses × priorities (bounded by TAXONOMY_OPTION_LIMITS).
	const pairs = statuses
		.filter((status) => !finals.has(status) && (byStatus.get(status) ?? 0) > 0)
		.flatMap((status) => priorities.map((priority) => [status, priority] as [string, string]));
	const pairCounts = pairs.length
		? await feedbackByStatus.countBatch(
				ctx,
				pairs.map((key) => ({ namespace: projectId, bounds: { eq: key } })),
			)
		: [];
	const openByPriority = new Map<string, number>(priorities.map((priority) => [priority, 0]));
	pairs.forEach(([, priority], index) => {
		openByPriority.set(priority, (openByPriority.get(priority) ?? 0) + pairCounts[index]);
	});
	let completed = 0;
	for (const [status, count] of byStatus) if (finals.has(status)) completed += count;
	const open = total - completed;
	const rankOf = new Map(taxonomies.priorities.map((entry) => [entry.value, entry.rank]));
	let laneRank = -1;
	for (const [priority, count] of openByPriority)
		if (count > 0) laneRank = Math.max(laneRank, rankOf.get(priority) ?? 0);
	const openAtRank = (rank: number) => {
		let count = 0;
		for (const [priority, value] of openByPriority)
			if ((rankOf.get(priority) ?? 0) === rank) count += value;
		return count;
	};
	return {
		total,
		open,
		completed,
		byStatus,
		openByPriority,
		laneRank,
		/** Open items whose priority has exactly this rank. */
		openAtRank,
	};
}

/**
 * Open workload per assignee (null = unassigned). `ranked` counts open items
 * whose priority rank is in each requested rank set (e.g. critical lane,
 * urgent top two ranks), in the same order.
 */
export async function assigneeWorkload(
	ctx: QueryCtx,
	projectId: Id<"projects">,
	assignees: readonly (Id<"users"> | null)[],
	taxonomies: { statuses: readonly Taxonomy[]; priorities: readonly Taxonomy[] },
	finals: ReadonlySet<string>,
	rankSets: readonly ReadonlySet<number>[] = [],
) {
	const openStatuses = taxonomies.statuses
		.map((entry) => entry.value)
		.filter((status) => !finals.has(status));
	const finalStatuses = [...finals];
	const rankedPriorities = rankSets.map((ranks) =>
		taxonomies.priorities.filter((entry) => ranks.has(entry.rank)).map((entry) => entry.value),
	);
	type Query = { namespace: Id<"projects">; bounds: { prefix: [Id<"users"> | null] | [Id<"users"> | null, string] } | { eq: [Id<"users"> | null, string, string] } };
	const queries: Query[] = [];
	const layout = assignees.map((assignee) => {
		const start = queries.length;
		queries.push({ namespace: projectId, bounds: { prefix: [assignee] } });
		for (const status of finalStatuses)
			queries.push({ namespace: projectId, bounds: { prefix: [assignee, status] } });
		const groups = rankedPriorities.map((priorities) => {
			const groupStart = queries.length;
			// A rank set covering every priority (e.g. all share one rank) is
			// just the open status count: one prefix read instead of P eq reads.
			const everyPriority = priorities.length === taxonomies.priorities.length;
			for (const status of openStatuses) {
				if (everyPriority && priorities.length > 0) {
					queries.push({ namespace: projectId, bounds: { prefix: [assignee, status] } });
					continue;
				}
				for (const priority of priorities)
					queries.push({ namespace: projectId, bounds: { eq: [assignee, status, priority] } });
			}
			return [groupStart, queries.length] as const;
		});
		return { start, groups };
	});
	const counts = queries.length ? await feedbackByAssignee.countBatch(ctx, queries) : [];
	const sum = (from: number, to: number) => counts.slice(from, to).reduce((total, value) => total + value, 0);
	return new Map(
		assignees.map((assignee, index) => {
			const { start, groups } = layout[index];
			const total = counts[start];
			const closed = sum(start + 1, start + 1 + finalStatuses.length);
			return [
				assignee,
				{ open: total - closed, ranked: groups.map(([from, to]) => sum(from, to)) },
			] as const;
		}),
	);
}

/** Received and completed counts for each half-open [start, end) window. */
export async function windowCounts(
	ctx: QueryCtx,
	projectId: Id<"projects">,
	windows: readonly { start: number; end: number }[],
) {
	if (windows.length === 0) return { received: [], completed: [] };
	const queries = windows.map(({ start, end }) => ({
		namespace: projectId,
		bounds: windowBounds(start, end),
	}));
	const [received, completed] = await Promise.all([
		feedbackByReceived.countBatch(ctx, queries),
		feedbackByCompleted.countBatch(ctx, queries),
	]);
	return { received, completed };
}

/** Items one assignee completed inside [start, end). */
export async function assigneeCompletedIn(
	ctx: QueryCtx,
	projectId: Id<"projects">,
	assigneeId: Id<"users"> | null,
	start: number,
	end: number,
) {
	return await feedbackByAssigneeCompleted.count(ctx, {
		namespace: projectId,
		bounds: {
			lower: { key: [assigneeId, start], inclusive: true },
			upper: { key: [assigneeId, end], inclusive: false },
		},
	});
}

/** Category counts, largest first. */
export async function categoryCounts(
	ctx: QueryCtx,
	projectId: Id<"projects">,
	categories: readonly string[],
) {
	const counts = categories.length
		? await feedbackByCategory.countBatch(
				ctx,
				categories.map((category) => ({ namespace: projectId, bounds: { eq: category } })),
			)
		: [];
	return categories
		.map((category, index) => ({ category, count: counts[index] }))
		.filter((row) => row.count > 0)
		.sort((a, b) => b.count - a.count);
}
