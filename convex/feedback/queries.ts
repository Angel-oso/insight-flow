import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import type { NamedTableInfo, OrderedQuery, PaginationOptions } from "convex/server";
import { v, type Infer } from "convex/values";
import { ConvexError } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { Capability } from "../../lib/auth/permissions";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveProjectAccess } from "../access/roles";
import { PROJECT_MEMBER_LIMIT, requireProject } from "./access";
import { assigneeWorkload, projectBacklog } from "./aggregates";
import {
	getFinalStatuses,
	getTaxonomies,
	taxonomiesValidator,
} from "../taxonomies/lib";
import schema from "../schema";

const dayMs = 24 * 60 * 60 * 1000;
const staleDays = 7;

/**
 * A feedback row as members see it. The external submitter's email is
 * personal data: only members who triage (`feedback.triage`) receive it.
 * Everyone else gets `email: null` ("hidden"); an empty string still means
 * the sender shared no email.
 */
export const feedbackViewValidator = v.object({
	...schema.doc("feedback").fields,
	sender: v.union(
		v.object({ name: v.string(), email: v.union(v.string(), v.null()) }),
		v.null(),
	),
});

export type FeedbackView = Infer<typeof feedbackViewValidator>;

export function viewFeedback(item: Doc<"feedback">, permissions: readonly Capability[]) {
	if (!item.sender || hasCapability(permissions, "feedback.triage")) return item;
	return { ...item, sender: { name: item.sender.name, email: null } };
}

/** Discussion rows read per page (and the most one page may ask for). */
const DISCUSSION_PAGE_LIMIT = 100;

/** Public profile of a project member: never email, phone or auth fields. */
export const memberProfileValidator = v.object({
	_id: v.id("users"),
	name: v.union(v.string(), v.null()),
	image: v.union(v.string(), v.null()),
});

/**
 * Inbox shell: project, viewer grants, assignable members, taxonomies and
 * queue counters. Items are paged separately by `list`; counters come from
 * aggregates, so this stays O(members) regardless of project size.
 */
export const workspace = query({
	args: { projectSlug: v.string() },
	returns: v.object({
		project: schema.doc("projects"),
		role: schema.tables.roles.validator.fields.name,
		permissions: v.array(schema.tables.permissions.validator.fields.key),
		assignees: v.array(memberProfileValidator),
		taxonomies: taxonomiesValidator,
		summary: v.object({
			total: v.number(),
			open: v.number(),
			needsTriage: v.number(),
			unassigned: v.number(),
			critical: v.number(),
			// Highest priority rank present in the open backlog (-1 if none).
			laneRank: v.number(),
		}),
	}),
	handler: async (ctx, { projectSlug }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		const links = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) =>
				q.eq("projectId", project._id),
			)
			.take(PROJECT_MEMBER_LIMIT + 1);
		if (links.length > PROJECT_MEMBER_LIMIT)
			throw new ConvexError(
				`This workspace supports up to ${PROJECT_MEMBER_LIMIT} project members.`,
			);
		const assignees = (
			await Promise.all(
				links.map(async (link) => {
					const assignee = await resolveProjectAccess(ctx, link.userId, project._id);
					return assignee &&
						hasCapability(assignee.permissions, "project.view") &&
						hasCapability(assignee.permissions, "feedback.view")
						? {
								_id: assignee.user._id,
								name: assignee.user.name ?? null,
								image: assignee.user.image ?? null,
							}
						: null;
				}),
			)
		).filter((assignee) => assignee !== null);
		const taxonomies = await getTaxonomies(ctx, project.organizationId);
		const finals = await getFinalStatuses(ctx, project.organizationId);
		const backlog = await projectBacklog(ctx, project._id, taxonomies, finals);
		const workload = await assigneeWorkload(ctx, project._id, [null], taxonomies, finals);
		const minRank = Math.min(...taxonomies.statuses.map((entry) => entry.rank));
		const needsTriage = taxonomies.statuses
			.filter((entry) => entry.rank === minRank && !finals.has(entry.value))
			.reduce((total, entry) => total + (backlog.byStatus.get(entry.value) ?? 0), 0);
		return {
			project,
			role: access.role,
			permissions: access.permissions,
			assignees,
			taxonomies,
			summary: {
				total: backlog.total,
				open: backlog.open,
				needsTriage,
				unassigned: workload.get(null)?.open ?? 0,
				critical: backlog.laneRank < 0 ? 0 : backlog.openAtRank(backlog.laneRank),
				laneRank: backlog.laneRank,
			},
		};
	},
});

const listFilters = v.object({
	// Full-text match on the title (search index); results are by relevance.
	search: v.optional(v.string()),
	status: v.optional(v.string()),
	priority: v.optional(v.string()),
	category: v.optional(v.string()),
	// "me" resolves to the signed-in caller on the server.
	assignee: v.optional(
		v.union(v.literal("me"), v.literal("unassigned"), v.id("users")),
	),
	// Inclusive lower bound on receivedAt (date range filter).
	receivedAfter: v.optional(v.number()),
	// Needs-attention queue; `now` is the client clock (queries never read
	// the wall clock) used for the stale rule.
	attention: v.optional(v.object({ now: v.number() })),
});

/** Rows one inbox page may scan before returning a partial page. */
export const INBOX_MAX_ROWS_READ = 1000;

type FeedbackQuery = OrderedQuery<NamedTableInfo<DataModel, "feedback">>;

/**
 * Server-side paginated inbox. Equality filters and the date range use an
 * index range (one dimension) plus post-filters for the rest; search uses
 * the `search_title` index with filter fields. Newest first otherwise.
 */
export const list = query({
	args: {
		projectSlug: v.string(),
		filters: listFilters,
		paginationOpts: paginationOptsValidator,
	},
	returns: paginationResultValidator(feedbackViewValidator),
	handler: async (ctx, { projectSlug, filters, paginationOpts }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		const projectId = project._id;
		const assigneeId: Id<"users"> | null | undefined =
			filters.assignee === "me"
				? access.user._id
				: filters.assignee === "unassigned"
					? null
					: filters.assignee;
		const { status, priority, category, receivedAfter } = filters;

		let attention: { finals: string[]; high: string[]; staleBefore: number } | null = null;
		if (filters.attention) {
			const taxonomies = await getTaxonomies(ctx, project.organizationId);
			const finals = await getFinalStatuses(ctx, project.organizationId);
			const { laneRank } = await projectBacklog(ctx, projectId, taxonomies, finals);
			attention = {
				finals: [...finals],
				high: taxonomies.priorities
					.filter((entry) => entry.rank >= laneRank - 2)
					.map((entry) => entry.value),
				staleBefore: filters.attention.now - staleDays * dayMs,
			};
		}

		const search = filters.search?.trim() ?? "";
		const base: FeedbackQuery = search
			? ctx.db.query("feedback").withSearchIndex("search_title", (q) => {
					let range = q.search("title", search).eq("projectId", projectId);
					if (status !== undefined) range = range.eq("status", status);
					if (priority !== undefined) range = range.eq("priority", priority);
					if (category !== undefined) range = range.eq("category", category);
					if (assigneeId !== undefined) range = range.eq("assigneeId", assigneeId);
					return range;
				})
			: assigneeId !== undefined
				? ctx.db
						.query("feedback")
						.withIndex("by_projectId_assigneeId_receivedAt", (q) => {
							const range = q.eq("projectId", projectId).eq("assigneeId", assigneeId);
							return receivedAfter === undefined ? range : range.gte("receivedAt", receivedAfter);
						})
						.order("desc")
				: status !== undefined
					? ctx.db
							.query("feedback")
							.withIndex("by_projectId_status_receivedAt", (q) => {
								const range = q.eq("projectId", projectId).eq("status", status);
								return receivedAfter === undefined ? range : range.gte("receivedAt", receivedAfter);
							})
							.order("desc")
					: priority !== undefined
						? ctx.db
								.query("feedback")
								.withIndex("by_projectId_priority_receivedAt", (q) => {
									const range = q.eq("projectId", projectId).eq("priority", priority);
									return receivedAfter === undefined ? range : range.gte("receivedAt", receivedAfter);
								})
								.order("desc")
						: category !== undefined
							? ctx.db
									.query("feedback")
									.withIndex("by_projectId_category_receivedAt", (q) => {
										const range = q.eq("projectId", projectId).eq("category", category);
										return receivedAfter === undefined ? range : range.gte("receivedAt", receivedAfter);
									})
									.order("desc")
							: ctx.db
									.query("feedback")
									.withIndex("by_projectId_receivedAt", (q) => {
										const range = q.eq("projectId", projectId);
										return receivedAfter === undefined ? range : range.gte("receivedAt", receivedAfter);
									})
									.order("desc");

		const filtered = base.filter((q) => {
			// Redundant with the chosen index range, but keeps every path
			// correct whichever dimension the index covers.
			const conditions = [q.eq(q.field("projectId"), projectId)];
			if (status !== undefined) conditions.push(q.eq(q.field("status"), status));
			if (priority !== undefined) conditions.push(q.eq(q.field("priority"), priority));
			if (category !== undefined) conditions.push(q.eq(q.field("category"), category));
			if (assigneeId !== undefined) conditions.push(q.eq(q.field("assigneeId"), assigneeId));
			if (receivedAfter !== undefined) conditions.push(q.gte(q.field("receivedAt"), receivedAfter));
			if (attention) {
				for (const final of attention.finals)
					conditions.push(q.neq(q.field("status"), final));
				conditions.push(
					q.or(
						q.eq(q.field("assigneeId"), null),
						q.lte(q.field("updatedAt"), attention.staleBefore),
						...attention.high.map((value) => q.eq(q.field("priority"), value)),
					),
				);
			}
			return q.and(...conditions);
		});
		// Post-filters (attention queue, a second equality filter) can make
		// one page scan far more rows than it returns. Cap the scan so a
		// selective filter returns a short page with a continueCursor
		// (usePaginatedQuery keeps "CanLoadMore" and splits it if asked)
		// instead of hitting the read limits. Not enforced for search.
		const result = await filtered.paginate({
			...paginationOpts,
			maximumRowsRead: Math.min(
				paginationOpts.maximumRowsRead ?? INBOX_MAX_ROWS_READ,
				INBOX_MAX_ROWS_READ,
			),
		});
		return {
			...result,
			page: result.page.map((item) => viewFeedback(item, access.permissions)),
		};
	},
});

/**
 * Resolves a deep-linked `?feedback=<id>` that may not be in the loaded
 * page. Returns null (instead of throwing) for malformed ids or items from
 * another project, so a stale link simply clears.
 */
export const find = query({
	args: { projectSlug: v.string(), feedbackId: v.string() },
	returns: v.union(feedbackViewValidator, v.null()),
	handler: async (ctx, { projectSlug, feedbackId }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		const id = ctx.db.normalizeId("feedback", feedbackId);
		if (!id) return null;
		const item = await ctx.db.get("feedback", id);
		return item && item.projectId === project._id ? viewFeedback(item, access.permissions) : null;
	},
});

const commentViewValidator = v.object({ ...schema.doc("comments").fields, author: v.string() });

/** First page of each discussion list returned with `detail`. */
const DETAIL_PREVIEW = 20;

/**
 * One item with the newest page of its discussion. Older comments and
 * activity load through `comments` / `activities` (paginated). Returns null
 * when the item no longer exists (deleted while someone had it open) so the
 * inbox simply closes the panel.
 */
export const detail = query({
	args: { projectSlug: v.string(), feedbackId: v.id("feedback") },
	returns: v.union(
		v.object({
			item: feedbackViewValidator,
			comments: v.array(commentViewValidator),
			activities: v.array(schema.doc("activities")),
		}),
		v.null(),
	),
	handler: async (ctx, { projectSlug, feedbackId }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		const item = await ctx.db.get("feedback", feedbackId);
		if (!item) return null;
		if (item.projectId !== project._id)
			throw new ConvexError("Feedback not found in this project.");
		const rows = await ctx.db
			.query("comments")
			.withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", feedbackId))
			.order("desc")
			.take(DETAIL_PREVIEW);
		const comments = await Promise.all(rows.map((row) => withAuthor(ctx, row)));
		const activities = await ctx.db
			.query("activities")
			.withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", feedbackId))
			.order("desc")
			.take(DETAIL_PREVIEW);
		return { item: viewFeedback(item, access.permissions), comments, activities };
	},
});

async function withAuthor(ctx: QueryCtx, row: Doc<"comments">) {
	return {
		...row,
		author: (await ctx.db.get("users", row.authorId))?.name ?? "Former member",
	};
}

/** Item of this project whose discussion may be read; null once deleted. */
async function discussionItem(ctx: QueryCtx, projectSlug: string, feedbackId: Id<"feedback">) {
	const { project } = await requireProject(ctx, projectSlug);
	const item = await ctx.db.get("feedback", feedbackId);
	if (!item) return null;
	if (item.projectId !== project._id)
		throw new ConvexError("Feedback not found in this project.");
	return item;
}

const emptyPage = { page: [], isDone: true, continueCursor: "" };

function boundedPage(paginationOpts: PaginationOptions): PaginationOptions {
	return {
		...paginationOpts,
		numItems: Math.max(1, Math.min(paginationOpts.numItems, DISCUSSION_PAGE_LIMIT)),
	};
}

/** Internal notes of one item, newest first, page by page ("load older"). */
export const comments = query({
	args: {
		projectSlug: v.string(),
		feedbackId: v.id("feedback"),
		paginationOpts: paginationOptsValidator,
	},
	returns: paginationResultValidator(commentViewValidator),
	handler: async (ctx, { projectSlug, feedbackId, paginationOpts }) => {
		if (!(await discussionItem(ctx, projectSlug, feedbackId))) return emptyPage;
		const result = await ctx.db
			.query("comments")
			.withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", feedbackId))
			.order("desc")
			.paginate(boundedPage(paginationOpts));
		return { ...result, page: await Promise.all(result.page.map((row) => withAuthor(ctx, row))) };
	},
});

/** Activity of one item, newest first, page by page ("load older"). */
export const activities = query({
	args: {
		projectSlug: v.string(),
		feedbackId: v.id("feedback"),
		paginationOpts: paginationOptsValidator,
	},
	returns: paginationResultValidator(schema.doc("activities")),
	handler: async (ctx, { projectSlug, feedbackId, paginationOpts }) => {
		if (!(await discussionItem(ctx, projectSlug, feedbackId))) return emptyPage;
		return await ctx.db
			.query("activities")
			.withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", feedbackId))
			.order("desc")
			.paginate(boundedPage(paginationOpts));
	},
});
