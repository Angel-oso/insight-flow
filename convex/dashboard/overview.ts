import { ConvexError, v } from "convex/values";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveProjectAccess } from "../access/roles";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { PROJECT_MEMBER_LIMIT, requireProject } from "../feedback/access";
import {
	assigneeCompletedIn,
	assigneeWorkload,
	categoryCounts,
	projectBacklog,
	windowCounts,
} from "../feedback/aggregates";
import {
	getFinalStatuses,
	getPriorityRanks,
	getTaxonomies,
	taxonomiesValidator,
} from "../taxonomies/lib";
import schema from "../schema";
import { projectHealth } from "./health";

const dayMs = 24 * 60 * 60 * 1000;
const staleDays = 7;
/** Rows shown in (and read per bucket for) the needs-intervention queue. */
const ATTENTION_LIMIT = 10;
/** Personal open items listed on the overview. */
const MINE_OPEN_LIMIT = 8;
/** Recently updated personal items checked for new comments. */
const COMMENT_SCAN_LIMIT = 100;

const statusField = schema.tables.feedback.validator.fields.status;
const categoryField = schema.tables.feedback.validator.fields.category;
const priorityField = schema.tables.feedback.validator.fields.priority;

const healthStatus = v.union(
	v.literal("At risk"),
	v.literal("Needs attention"),
	v.literal("Healthy"),
);

const attentionReason = v.union(
	v.literal("Unassigned"),
	v.literal("Stale"),
	v.literal("No activity"),
);

const activityTone = v.union(
	v.literal("primary"),
	v.literal("neutral"),
	v.literal("success"),
	v.literal("warning"),
);

function initials(name: string) {
	return name
		.split(/\s+/)
		.map((part) => part[0])
		.slice(0, 2)
		.join("");
}

function isOpen(item: Doc<"feedback">, finals: ReadonlySet<string>) {
	return !finals.has(item.status);
}


export const get = query({
	args: {
		projectSlug: v.string(),
		from: v.number(),
		to: v.number(),
	},
	returns: v.object({
		viewer: v.object({
			role: v.string(),
			permissions: v.array(schema.tables.permissions.validator.fields.key),
		}),
		mine: v.object({
			open: v.array(v.object({
				id: v.id("feedback"), title: v.string(), priority: priorityField,
				status: statusField, receivedAt: v.number(), updatedAt: v.number(),
			})),
			openCount: v.number(), urgentCount: v.number(), completedInRange: v.number(),
			withNewComments: v.array(v.object({
				id: v.id("feedback"), title: v.string(), latestCommentAt: v.number(),
			})),
		}),
		workload: v.union(v.null(), v.array(v.object({
			name: v.string(), initials: v.string(), openAssigned: v.number(), criticalAssigned: v.number(),
		}))),
		project: v.object({
			name: v.string(),
			slug: v.string(),
			status: schema.tables.projects.validator.fields.status,
		}),
		metrics: v.object({
			received: v.number(),
			receivedPrevious: v.number(),
			open: v.number(),
			critical: v.number(),
			criticalUnassigned: v.number(),
			criticalLabel: v.union(v.string(), v.null()),
			criticalColor: v.union(v.string(), v.null()),
			completedInRange: v.number(),
			completedPrevious: v.number(),
			total: v.number(),
		}),
		trend: v.array(
			v.object({
				dayStart: v.number(),
				received: v.number(),
				resolved: v.number(),
			}),
		),
		statuses: v.array(
			v.object({ status: statusField, count: v.number() }),
		),
		categories: v.array(
			v.object({ category: categoryField, count: v.number() }),
		),
		attention: v.array(
			v.object({
				id: v.id("feedback"),
				title: v.string(),
				priority: priorityField,
				reason: attentionReason,
				updatedAt: v.number(),
			}),
		),
		health: v.object({
			received: v.number(),
			open: v.number(),
			critical: v.number(),
			completed: v.number(),
			total: v.number(),
			lastActivityAt: v.union(v.number(), v.null()),
			status: healthStatus,
		}),
		activities: v.array(
			v.object({
				id: v.id("activities"),
				feedbackId: v.union(v.id("feedback"), v.null()),
				projectSlug: v.string(),
				actor: v.string(),
				initials: v.string(),
				action: v.string(),
				createdAt: v.number(),
				tone: activityTone,
			}),
		),
		taxonomies: taxonomiesValidator,
		generatedAt: v.number(),
	}),
	handler: async (ctx, { projectSlug, from, to }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > 365 * dayMs) {
			throw new ConvexError("Choose a valid date window of at most 365 days.");
		}
		const projectId: Id<"projects"> = project._id;
		const rangeStart = from;
		const previousStart = from - (to - from);

		// Dynamic taxonomy rules: final states close the backlog, and the
		// highest priority rank defines the critical lane.
		const taxonomies = await getTaxonomies(ctx, project.organizationId);
		const finals = await getFinalStatuses(ctx, project.organizationId);
		const priorityRank = await getPriorityRanks(ctx, project.organizationId);
		const rankOf = (priority: string) => priorityRank.get(priority) ?? 0;
		const openStatuses = taxonomies.statuses
			.map((entry) => entry.value)
			.filter((status) => !finals.has(status));
		const priorityValues = taxonomies.priorities.map((entry) => entry.value);

		// Counts come from aggregates (O(log n)), never from reading rows.
		const backlog = await projectBacklog(ctx, projectId, taxonomies, finals);
		// Critical lane = highest rank present in the open backlog, so an
		// unused higher rank never zeroes the counters.
		const laneRank = backlog.laneRank;
		const lanePriority = taxonomies.priorities.find((entry) => entry.rank === laneRank);
		const open = backlog.open;
		const critical = laneRank < 0 ? 0 : backlog.openAtRank(laneRank);
		const unassignedLane = await assigneeWorkload(ctx, projectId, [null], taxonomies, finals, [
			new Set([laneRank]),
		]);
		const criticalUnassigned = unassignedLane.get(null)?.ranked[0] ?? 0;

		// Half-open windows: current, previous, then one bucket per day.
		const days = Array.from({ length: Math.ceil((to - from) / dayMs) }, (_, index) => {
			const dayStart = rangeStart + index * dayMs;
			return { start: dayStart, end: Math.min(dayStart + dayMs, to) };
		});
		const windows = await windowCounts(ctx, projectId, [
			{ start: rangeStart, end: to },
			{ start: previousStart, end: rangeStart },
			...days,
		]);
		const trend = days.map((window, index) => ({
			dayStart: window.start,
			received: windows.received[index + 2],
			resolved: windows.completed[index + 2],
		}));

		// Status distribution in taxonomy rank order.
		const statuses = [...taxonomies.statuses]
			.sort((a, b) => a.rank - b.rank)
			.map((entry) => ({ status: entry.value, count: backlog.byStatus.get(entry.value) ?? 0 }));
		const categories = (
			await categoryCounts(ctx, projectId, taxonomies.categories.map((entry) => entry.value))
		).slice(0, 5);

		// Needs-intervention queue: a bounded read per open status×priority
		// bucket (oldest activity first, plus the oldest unassigned), then
		// the same ranking as before over that candidate set.
		const buckets = await Promise.all(
			openStatuses.flatMap((status) =>
				priorityValues.flatMap((priority) => [
					ctx.db
						.query("feedback")
						.withIndex("by_projectId_status_priority_updatedAt", (q) =>
							q.eq("projectId", projectId).eq("status", status).eq("priority", priority),
						)
						.take(ATTENTION_LIMIT),
					ctx.db
						.query("feedback")
						.withIndex("by_projectId_assigneeId_status_priority_receivedAt", (q) =>
							q
								.eq("projectId", projectId)
								.eq("assigneeId", null)
								.eq("status", status)
								.eq("priority", priority),
						)
						.take(ATTENTION_LIMIT),
				]),
			),
		);
		const candidates = new Map<Id<"feedback">, Doc<"feedback">>();
		for (const item of buckets.flat()) candidates.set(item._id, item);
		type AttentionCandidate = {
			id: Id<"feedback">;
			title: string;
			priority: string;
			reason: "Unassigned" | "Stale" | "No activity";
			updatedAt: number;
			rank: number;
		};
		const attentionCandidates: AttentionCandidate[] = [];
		for (const item of candidates.values()) {
			if (!isOpen(item, finals)) continue;
			const stale = to - item.updatedAt >= staleDays * dayMs;
			const needsAttention =
				rankOf(item.priority) >= laneRank - 2 ||
				item.assigneeId === null ||
				stale;
			if (!needsAttention) continue;
			attentionCandidates.push({
				id: item._id,
				title: item.title,
				priority: item.priority,
				reason:
					item.assigneeId === null
						? "Unassigned"
						: stale
							? "Stale"
							: "No activity",
				updatedAt: item.updatedAt,
				rank: rankOf(item.priority),
			});
		}
		attentionCandidates.sort(
			(a, b) =>
				b.rank - a.rank ||
				Number(a.reason !== "Unassigned") - Number(b.reason !== "Unassigned") ||
				a.updatedAt - b.updatedAt,
		);
		const attention = attentionCandidates.slice(0, ATTENTION_LIMIT).map((candidate) => ({
			id: candidate.id,
			title: candidate.title,
			priority: candidate.priority,
			reason: candidate.reason,
			updatedAt: candidate.updatedAt,
		}));

		const [latestUpdate] = await ctx.db
			.query("feedback")
			.withIndex("by_projectId_updatedAt", (q) => q.eq("projectId", projectId))
			.order("desc")
			.take(1);
		const lastActivityAt = latestUpdate?.updatedAt ?? null;

		const activityRows = await ctx.db
			.query("activities")
			.withIndex("by_projectId_createdAt", (q) => q.eq("projectId", projectId))
			.order("desc")
			.take(20);
		const activities = await Promise.all(
			activityRows.map(async (activity) => {
				const actor = activity.actorId
					? ((await ctx.db.get("users", activity.actorId))?.name ?? "Former member")
					: "System";
				return {
					id: activity._id,
					feedbackId: activity.feedbackId ?? null,
					projectSlug: project.slug,
					actor,
					initials: initials(actor),
					action: activity.message,
					createdAt: activity.createdAt,
					tone:
						activity.type === "received" || activity.type === "status_changed" || activity.type === "project_created"
							? ("primary" as const)
							: ("neutral" as const),
				};
			}),
		);

		// Personal work spans the current backlog; only completions use the window.
		const viewerId = access.user._id;
		const taxonomyRanks = [...new Set(taxonomies.priorities.map((priority) => priority.rank))].sort((a, b) => b - a);
		const urgentRanks = new Set(taxonomyRanks.slice(0, 2));
		const myWorkload = (
			await assigneeWorkload(ctx, projectId, [viewerId], taxonomies, finals, [urgentRanks])
		).get(viewerId);
		// Top personal items: highest priority, then oldest. Each status×priority
		// bucket only needs its oldest MINE_OPEN_LIMIT rows to fill the list.
		const myBuckets = await Promise.all(
			openStatuses.flatMap((status) =>
				priorityValues.map((priority) =>
					ctx.db
						.query("feedback")
						.withIndex("by_projectId_assigneeId_status_priority_receivedAt", (q) =>
							q
								.eq("projectId", projectId)
								.eq("assigneeId", viewerId)
								.eq("status", status)
								.eq("priority", priority),
						)
						.take(MINE_OPEN_LIMIT),
				),
			),
		);
		const mineOpen = myBuckets
			.flat()
			.sort((a, b) => rankOf(b.priority) - rankOf(a.priority) || a.receivedAt - b.receivedAt)
			.slice(0, MINE_OPEN_LIMIT);
		// New comments surface on recently updated work (notes bump updatedAt).
		const recentlyUpdated = (
			await ctx.db
				.query("feedback")
				.withIndex("by_projectId_assigneeId_updatedAt", (q) =>
					q.eq("projectId", projectId).eq("assigneeId", viewerId),
				)
				.order("desc")
				.take(COMMENT_SCAN_LIMIT)
		).filter((item) => isOpen(item, finals));
		const commentUpdates = await Promise.all(recentlyUpdated.map(async (item) => {
			const [latest] = await ctx.db.query("comments")
				.withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", item._id))
				.order("desc").take(1);
			if (!latest || latest.authorId === viewerId) return null;
			// The newest comment is from someone else. Only an own comment at
			// the exact same instant can prevent it from being strictly newer.
			const [ownAtSameTime] = await ctx.db.query("comments")
				.withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", item._id).eq("createdAt", latest.createdAt))
				.filter((q) => q.eq(q.field("authorId"), viewerId)).take(1);
			return ownAtSameTime ? null : { id: item._id, title: item.title, latestCommentAt: latest.createdAt };
		}));
		const mine = {
			open: mineOpen.map((item) => ({
				id: item._id, title: item.title, priority: item.priority, status: item.status,
				receivedAt: item.receivedAt, updatedAt: item.updatedAt,
			})),
			openCount: myWorkload?.open ?? 0,
			urgentCount: myWorkload?.ranked[0] ?? 0,
			completedInRange: await assigneeCompletedIn(ctx, projectId, viewerId, from, to),
			withNewComments: commentUpdates.filter((item) => item !== null)
				.sort((a, b) => b.latestCommentAt - a.latestCommentAt).slice(0, 5),
		};
		let workload: { name: string; initials: string; openAssigned: number; criticalAssigned: number }[] | null = null;
		if (hasCapability(access.permissions, "feedback.assign")) {
			const links = await ctx.db.query("projectMembers")
				.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId)).take(PROJECT_MEMBER_LIMIT + 1);
			if (links.length > PROJECT_MEMBER_LIMIT)
				throw new ConvexError(`This overview supports up to ${PROJECT_MEMBER_LIMIT} project members.`);
			const members = (await Promise.all(links.map(async (link) => {
				const memberAccess = await resolveProjectAccess(ctx, link.userId, projectId);
				if (!memberAccess || !hasCapability(memberAccess.permissions, "feedback.view")) return null;
				return { id: link.userId, name: memberAccess.user.name ?? "Team member" };
			}))).filter((member) => member !== null);
			const counts = await assigneeWorkload(
				ctx, projectId, members.map((member) => member.id), taxonomies, finals,
				[new Set(taxonomyRanks.slice(0, 1))],
			);
			workload = members.map((member) => {
				const row = counts.get(member.id);
				return {
					name: member.name, initials: initials(member.name),
					openAssigned: row?.open ?? 0,
					criticalAssigned: row?.ranked[0] ?? 0,
				};
			}).sort((a, b) => b.openAssigned - a.openAssigned || a.name.localeCompare(b.name));
		}
		// Health uses the taxonomy's top rank (shared rule with the org overview).
		const topRank = Math.max(0, ...priorityRank.values());

		return {
			viewer: { role: access.role, permissions: access.permissions },
			mine,
			workload,
			project: { name: project.name, slug: project.slug, status: project.status },
			metrics: {
				received: windows.received[0],
				receivedPrevious: windows.received[1],
				open,
				critical,
				criticalUnassigned,
				criticalLabel: lanePriority?.label ?? null,
				criticalColor: lanePriority?.color ?? null,
				completedInRange: windows.completed[0],
				completedPrevious: windows.completed[1],
				total: backlog.total,
			},
			trend,
			statuses,
			categories,
			attention,
			health: {
				received: backlog.total,
				open,
				critical,
				completed: backlog.completed,
				total: backlog.total,
				lastActivityAt,
				status: projectHealth({ open, critical: backlog.openAtRank(topRank) }).status,
			},
			activities,
			taxonomies,
			generatedAt: to,
		};
	},
});
