import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { resolveUserAccess } from "../access/roles";
import { listProjectFeedback, requireCapability, requireProject } from "../feedback/access";
import { getFinalStatuses, getPriorityRanks, getTaxonomies } from "../taxonomies/lib";
import schema from "../schema";

function isOpen(item: Doc<"feedback">, finals: ReadonlySet<string>) {
	return !finals.has(item.status);
}

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
		members: v.array(
			v.object({
				id: v.id("users"),
				name: v.string(),
				email: v.string(),
				role: schema.tables.roles.validator.fields.name,
				projectCount: v.number(),
				openAssigned: v.number(),
				criticalAssigned: v.number(),
				lastActivityAt: v.union(v.number(), v.null()),
				joinedAt: v.number(),
			}),
		),
	}),
	handler: async (ctx, { projectSlug }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "team.view");
		const projectId: Id<"projects"> = project._id;

		const links = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId))
			.take(51);
		if (links.length > 50)
			throw new Error("This workspace supports up to 50 project members.");

		// Project-level backlog for the unassigned count (bounded, shared cap).
		const items = await listProjectFeedback(ctx, projectId);
		const finals = await getFinalStatuses(ctx);
		const priorityRank = await getPriorityRanks(ctx);
		const rankOf = (priority: string) => priorityRank.get(priority) ?? 0;
		let unassigned = 0;
		let critical = 0;
		// Critical lane = highest rank present in the open backlog.
		let laneRank = -1;
		for (const item of items) {
			if (!isOpen(item, finals)) continue;
			laneRank = Math.max(laneRank, rankOf(item.priority));
		}
		for (const item of items) {
			if (!isOpen(item, finals)) continue;
			if (item.assigneeId === null) unassigned += 1;
			if (rankOf(item.priority) === laneRank) critical += 1;
		}

		const members = [];
		for (const link of links) {
			const member = await resolveUserAccess(ctx, link.userId);
			if (!member || member.user.organizationId !== project.organizationId) continue;
			const user = member.user;
			const assigned = await ctx.db
				.query("feedback")
				.withIndex("by_projectId_assigneeId", (q) =>
					q.eq("projectId", projectId).eq("assigneeId", user._id),
				)
				.take(201);
			let openAssigned = 0;
			let criticalAssigned = 0;
			let lastActivityAt: number | null = null;
			for (const item of assigned) {
				if (item.updatedAt > (lastActivityAt ?? 0)) lastActivityAt = item.updatedAt;
				if (!isOpen(item, finals)) continue;
				openAssigned += 1;
				if (rankOf(item.priority) === laneRank) criticalAssigned += 1;
			}
			const scope = await ctx.db
				.query("projectMembers")
				.withIndex("by_userId", (q) => q.eq("userId", user._id))
				.take(51);
			let projectCount = 0;
			for (const projectLink of scope) {
				const linkedProject = await ctx.db.get("projects", projectLink.projectId);
				if (linkedProject?.organizationId === project.organizationId) projectCount += 1;
			}
			members.push({
				id: user._id,
				name: user.name ?? "Unknown member",
				email: user.email ?? "",
				role: member.role,
				projectCount,
				openAssigned,
				criticalAssigned,
				lastActivityAt,
				joinedAt: link.joinedAt,
			});
		}
		// Most loaded first: where work is concentrated.
		members.sort(
			(a, b) =>
				b.openAssigned - a.openAssigned ||
				b.criticalAssigned - a.criticalAssigned ||
				a.name.localeCompare(b.name),
		);

		const coordinatorCount = members.filter((member) => member.role !== "member").length;
		const openAssigned = members.reduce((total, member) => total + member.openAssigned, 0);
		const { priorities } = await getTaxonomies(ctx);
		const lanePriority = priorities.find((entry) => entry.rank === laneRank);
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
			members,
		};
	},
});
