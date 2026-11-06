import { ConvexError, v } from "convex/values";
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveProjectAccess } from "../access/roles";
import { PROJECT_MEMBER_LIMIT, requireCapability, requireProject } from "../feedback/access";
import { assigneeWorkload, projectBacklog } from "../feedback/aggregates";
import { getFinalStatuses, getTaxonomies } from "../taxonomies/lib";
import schema from "../schema";

/** Project links read to count one member's projects in this org. */
const PROJECT_SCOPE_LIMIT = 100;

export const get = query({
	args: { projectSlug: v.string() },
	returns: v.object({
		project: v.object({
			name: v.string(),
			slug: v.string(),
		}),
		summary: v.object({
			memberCount: v.number(),
			coordinatorCount: v.number(),
			openAssigned: v.number(),
			unassigned: v.number(),
			critical: v.number(),
			criticalLabel: v.union(v.string(), v.null()),
			criticalColor: v.union(v.string(), v.null()),
		}),
		showsWorkload: v.boolean(),
		members: v.array(
			v.object({
				id: v.id("users"),
				roleId: v.id("roles"),
				name: v.string(),
				// Contact details are for people who manage the team; other
				// members get null (names are enough to collaborate).
				email: v.union(v.string(), v.null()),
				role: schema.tables.roles.validator.fields.name,
				// Per-person workload is null unless the caller can assign work
				// (PRODUCT.md: members never get team-performance comparisons).
				openAssigned: v.union(v.number(), v.null()),
				criticalAssigned: v.union(v.number(), v.null()),
				lastActivityAt: v.union(v.number(), v.null()),
				joinedAt: v.number(),
			}),
		),
	}),
	handler: async (ctx, { projectSlug }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "team.view");
		const showsWorkload = hasCapability(access.permissions, "feedback.assign");
		const showsEmail = hasCapability(access.permissions, "team.manage");
		const projectId: Id<"projects"> = project._id;

		const links = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId))
			.take(PROJECT_MEMBER_LIMIT + 1);
		if (links.length > PROJECT_MEMBER_LIMIT)
			throw new ConvexError(`This workspace supports up to ${PROJECT_MEMBER_LIMIT} project members.`);

		// Project backlog from aggregates: no feedback rows are read.
		const taxonomies = await getTaxonomies(ctx, project.organizationId);
		const finals = await getFinalStatuses(ctx, project.organizationId);
		const backlog = await projectBacklog(ctx, projectId, taxonomies, finals);
		// Critical lane = highest rank present in the open backlog.
		const laneRank = backlog.laneRank;
		const critical = laneRank < 0 ? 0 : backlog.openAtRank(laneRank);

		const resolved = (
			await Promise.all(links.map(async (link) => {
				const member = await resolveProjectAccess(ctx, link.userId, projectId);
				return member ? { link, member } : null;
			}))
		).filter((row) => row !== null);
		// Two passes keep aggregate reads linear in the team size: open counts
		// for everyone, then the critical-lane split only for people (and the
		// unassigned queue) who actually hold open work.
		const assignees = [null, ...resolved.map(({ member }) => member.user._id)];
		const openWorkload = await assigneeWorkload(ctx, projectId, assignees, taxonomies, finals);
		const busy = laneRank < 0
			? []
			: assignees.filter((assignee) => (openWorkload.get(assignee)?.open ?? 0) > 0);
		const laneWorkload = busy.length
			? await assigneeWorkload(ctx, projectId, busy, taxonomies, finals, [new Set([laneRank])])
			: new Map<Id<"users"> | null, { open: number; ranked: number[] }>();
		const unassigned = openWorkload.get(null)?.open ?? 0;

		// Per-person project scope is loaded lazily (memberProjectCount): reading
		// every member's project links here multiplied reads by the team size.
		const members = await Promise.all(resolved.map(async ({ link, member }) => {
			const user = member.user;
			const [latest] = await ctx.db
				.query("feedback")
				.withIndex("by_projectId_assigneeId_updatedAt", (q) =>
					q.eq("projectId", projectId).eq("assigneeId", user._id),
				)
				.order("desc")
				.take(1);
			return {
				id: user._id,
				roleId: member.roleId,
				name: user.name ?? "Unknown member",
				email: showsEmail ? (user.email ?? null) : null,
				role: member.role,
				openAssigned: openWorkload.get(user._id)?.open ?? 0,
				criticalAssigned: laneWorkload.get(user._id)?.ranked[0] ?? 0,
				lastActivityAt: latest?.updatedAt ?? null,
				joinedAt: link.joinedAt,
			};
		}));
		// Most loaded first: where work is concentrated.
		members.sort(
			(a, b) =>
				b.openAssigned - a.openAssigned ||
				b.criticalAssigned - a.criticalAssigned ||
				a.name.localeCompare(b.name),
		);
		const visibleMembers = showsWorkload
			? members
			: members
					.map((member) => ({
						...member,
						openAssigned: null,
						criticalAssigned: null,
						lastActivityAt: null,
					}))
					.sort((a, b) => a.name.localeCompare(b.name));

		const coordinatorCount = members.filter((member) => member.role !== "member").length;
		const openAssigned = members.reduce((total, member) => total + member.openAssigned, 0);
		const lanePriority = taxonomies.priorities.find((entry) => entry.rank === laneRank);
		const criticalLabel = lanePriority?.label ?? null;
		const criticalColor = lanePriority?.color ?? null;

		return {
			project: { name: project.name, slug: project.slug },
			summary: {
				memberCount: members.length,
				coordinatorCount,
				openAssigned,
				unassigned,
				critical,
				criticalLabel,
				criticalColor,
			},
			showsWorkload,
			members: visibleMembers,
		};
	},
});


/**
 * How many live projects of this organization one teammate belongs to.
 * Loaded per row so the roster query stays linear in the team size. Null
 * for callers who do not see workload (same rule as the roster) or when
 * the person is not on this project's team.
 */
export const memberProjectCount = query({
	args: { projectSlug: v.string(), memberId: v.id("users") },
	returns: v.union(v.object({ count: v.number(), capped: v.boolean() }), v.null()),
	handler: async (ctx, { projectSlug, memberId }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "team.view");
		if (!hasCapability(access.permissions, "feedback.assign")) return null;
		const link = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", project._id).eq("userId", memberId))
			.unique();
		if (!link) return null;
		const scope = await ctx.db
			.query("projectMembers")
			.withIndex("by_userId", (q) => q.eq("userId", memberId))
			.take(PROJECT_SCOPE_LIMIT + 1);
		const linkedProjects = await Promise.all(
			scope.slice(0, PROJECT_SCOPE_LIMIT).map((row) => ctx.db.get("projects", row.projectId)),
		);
		const count = linkedProjects.filter(
			(linked) =>
				linked?.organizationId === project.organizationId &&
				linked.deletionRequestedAt === undefined,
		).length;
		return { count, capped: scope.length > PROJECT_SCOPE_LIMIT };
	},
});
