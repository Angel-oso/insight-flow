import { ConvexError, v } from "convex/values";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveProjectAccess } from "../access/roles";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { listProjectFeedback, requireProject } from "../feedback/access";
import {
	getFinalStatuses,
	getPriorityRanks,
	getTaxonomies,
	taxonomiesValidator,
} from "../taxonomies/lib";
import schema from "../schema";

const dayMs = 24 * 60 * 60 * 1000;
const staleDays = 7;

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

/** Transparent project-health rules, shared by the overview and its footer. */
function healthStatusFor(open: number, critical: number) {
	if (critical > 0) return "At risk" as const;
	if (open > 0) return "Needs attention" as const;
	return "Healthy" as const;
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

		const inRange = (timestamp: number, start: number, end: number) =>
			timestamp >= start && timestamp < end;

		// Full project listing (bounded, shared cap) for open/critical/
		// categories/attention/health aggregates.
		const items = await listProjectFeedback(ctx, projectId);

		// Index-driven window counts for received vs. resolved movement.
		const receivedInRange = await ctx.db
			.query("feedback")
			.withIndex("by_projectId_receivedAt", (q) =>
				q.eq("projectId", projectId).gte("receivedAt", rangeStart).lt("receivedAt", to),
			)
			.take(201);
		const receivedPrevious = await ctx.db
			.query("feedback")
			.withIndex("by_projectId_receivedAt", (q) =>
				q
					.eq("projectId", projectId)
					.gte("receivedAt", previousStart)
					.lt("receivedAt", rangeStart),
			)
			.take(201);
		const resolvedInRange = await ctx.db
			.query("feedback")
			.withIndex("by_projectId_completedAt", (q) =>
				q.eq("projectId", projectId).gte("completedAt", rangeStart).lt("completedAt", to),
			)
			.take(201);
		const resolvedPrevious = await ctx.db
			.query("feedback")
			.withIndex("by_projectId_completedAt", (q) =>
				q
					.eq("projectId", projectId)
					.gte("completedAt", previousStart)
					.lt("completedAt", rangeStart),
			)
			.take(201);

		// Daily buckets for the movement chart.
		const receivedByDay = new Map<number, number>();
		for (const item of receivedInRange) {
			const dayStart = rangeStart + Math.floor((item.receivedAt - rangeStart) / dayMs) * dayMs;
			receivedByDay.set(dayStart, (receivedByDay.get(dayStart) ?? 0) + 1);
		}
		const resolvedByDay = new Map<number, number>();
		for (const item of resolvedInRange) {
			if (item.completedAt === undefined) continue;
			const dayStart = rangeStart + Math.floor((item.completedAt - rangeStart) / dayMs) * dayMs;
			resolvedByDay.set(dayStart, (resolvedByDay.get(dayStart) ?? 0) + 1);
		}
		const trend = Array.from({ length: Math.ceil((to - from) / dayMs) }, (_, index) => {
			const dayStart = rangeStart + index * dayMs;
			return {
				dayStart,
				received: receivedByDay.get(dayStart) ?? 0,
				resolved: resolvedByDay.get(dayStart) ?? 0,
			};
		});

		// Status distribution in taxonomy rank order, one bounded indexed
		// read per lane.
		const statusOrder = [...taxonomies.statuses]
			.sort((a, b) => a.rank - b.rank)
			.map((entry) => entry.value);
		const statuses = await Promise.all(
			statusOrder.map(async (status) => {
				const rows = await ctx.db
					.query("feedback")
					.withIndex("by_projectId_status", (q) =>
						q.eq("projectId", projectId).eq("status", status),
					)
					.take(201);
				return { status, count: rows.length };
			}),
		);

		let open = 0;
		let critical = 0;
		let criticalUnassigned = 0;
		let completed = 0;
		let lastActivityAt: number | null = null;
		// Critical lane = highest rank present in the open backlog, so an
		// unused higher rank never zeroes the counters. Attention covers the
		// top three present lanes.
		let laneRank = -1;
		for (const item of items) {
			if (finals.has(item.status)) continue;
			laneRank = Math.max(laneRank, rankOf(item.priority));
		}
		const laneLabel =
			taxonomies.priorities.find((entry) => entry.rank === laneRank)?.label ??
			null;
		const laneColor =
			taxonomies.priorities.find((entry) => entry.rank === laneRank)?.color ??
			null;
		const categoryCounts = new Map<string, number>();
		type AttentionCandidate = {
			id: Id<"feedback">;
			title: string;
			priority: string;
			reason: "Unassigned" | "Stale" | "No activity";
			updatedAt: number;
			rank: number;
		};
		const attentionCandidates: AttentionCandidate[] = [];
		for (const item of items) {
			if (item.updatedAt > (lastActivityAt ?? 0)) lastActivityAt = item.updatedAt;
			categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
			if (!isOpen(item, finals)) {
				if (finals.has(item.status)) completed += 1;
				continue;
			}
			open += 1;
			if (rankOf(item.priority) === laneRank) {
				critical += 1;
				if (item.assigneeId === null) criticalUnassigned += 1;
			}
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
		const attention = attentionCandidates.slice(0, 10).map((candidate) => ({
			id: candidate.id,
			title: candidate.title,
			priority: candidate.priority,
			reason: candidate.reason,
			updatedAt: candidate.updatedAt,
		}));

		const categories = [...categoryCounts.entries()]
			.map(([category, count]) => ({ category, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 5);

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
		const assigned = await ctx.db.query("feedback")
			.withIndex("by_projectId_assigneeId", (q) => q.eq("projectId", projectId).eq("assigneeId", access.user._id))
			.take(201);
		const mineOpen = assigned.filter((item) => isOpen(item, finals))
			.sort((a, b) => rankOf(b.priority) - rankOf(a.priority) || a.receivedAt - b.receivedAt);
		const taxonomyRanks = [...new Set(taxonomies.priorities.map((priority) => priority.rank))].sort((a, b) => b - a);
		const urgentRanks = new Set(taxonomyRanks.slice(0, 2));
		const commentUpdates = await Promise.all(mineOpen.map(async (item) => {
			const [latest] = await ctx.db.query("comments")
				.withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", item._id))
				.order("desc").take(1);
			if (!latest || latest.authorId === access.user._id) return null;
			// The newest comment is from someone else. Only an own comment at
			// the exact same instant can prevent it from being strictly newer.
			const [ownAtSameTime] = await ctx.db.query("comments")
				.withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", item._id).eq("createdAt", latest.createdAt))
				.filter((q) => q.eq(q.field("authorId"), access.user._id)).take(1);
			return ownAtSameTime ? null : { id: item._id, title: item.title, latestCommentAt: latest.createdAt };
		}));
		const mine = {
			open: mineOpen.slice(0, 8).map((item) => ({
				id: item._id, title: item.title, priority: item.priority, status: item.status,
				receivedAt: item.receivedAt, updatedAt: item.updatedAt,
			})),
			openCount: mineOpen.length,
			urgentCount: mineOpen.filter((item) => urgentRanks.has(rankOf(item.priority))).length,
			completedInRange: assigned.filter((item) => item.completedAt !== undefined && inRange(item.completedAt, from, to)).length,
			withNewComments: commentUpdates.filter((item) => item !== null)
				.sort((a, b) => b.latestCommentAt - a.latestCommentAt).slice(0, 5),
		};
		let workload: { name: string; initials: string; openAssigned: number; criticalAssigned: number }[] | null = null;
		if (hasCapability(access.permissions, "feedback.assign")) {
			const links = await ctx.db.query("projectMembers")
				.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId)).take(201);
			if (links.length > 200) throw new ConvexError("This overview supports up to 200 project members.");
			const rows = await Promise.all(links.map(async (link) => {
				const memberAccess = await resolveProjectAccess(ctx, link.userId, projectId);
				if (!memberAccess || !hasCapability(memberAccess.permissions, "feedback.view")) return null;
				const memberOpen = items.filter((item) => item.assigneeId === link.userId && isOpen(item, finals));
				const name = memberAccess.user.name ?? "Team member";
				return {
					name, initials: initials(name),
					openAssigned: memberOpen.length,
					criticalAssigned: memberOpen.filter((item) => rankOf(item.priority) === taxonomyRanks[0]).length,
				};
			}));
			workload = rows.filter((row) => row !== null).sort((a, b) => b.openAssigned - a.openAssigned || a.name.localeCompare(b.name));
		}

		return {
			viewer: { role: access.role, permissions: access.permissions },
			mine,
			workload,
			project: { name: project.name, slug: project.slug, status: project.status },
			metrics: {
				received: receivedInRange.filter((item) =>
					inRange(item.receivedAt, rangeStart, to),
				).length,
				receivedPrevious: receivedPrevious.length,
				open,
				critical,
				criticalUnassigned,
				criticalLabel: laneLabel,
				criticalColor: laneColor,
				completedInRange: resolvedInRange.filter(
					(item) =>
						item.completedAt !== undefined &&
						inRange(item.completedAt, rangeStart, to),
				).length,
				completedPrevious: resolvedPrevious.length,
				total: items.length,
			},
			trend,
			statuses,
			categories,
			attention,
			health: {
				received: items.length,
				open,
				critical,
				completed,
				total: items.length,
				lastActivityAt,
				status: healthStatusFor(open, critical),
			},
			activities,
			taxonomies,
			generatedAt: to,
		};
	},
});
