import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { listProjectFeedback, requireProject } from "./feedback/access";
import { getFinalStatuses, getMaxPriorityRank, getPriorityRanks } from "./taxonomies";
import schema from "./schema";

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
		}),
		members: v.array(
			v.object({
				id: v.id("users"),
				name: v.string(),
				email: v.string(),
				role: schema.tables.memberships.validator.fields.role,
				projectCount: v.number(),
				openAssigned: v.number(),
				criticalAssigned: v.number(),
				lastActivityAt: v.union(v.number(), v.null()),
				joinedAt: v.number(),
			}),
		),
	}),
	handler: async (ctx, { projectSlug }) => {
		const { project } = await requireProject(ctx, projectSlug);
		const projectId: Id<"projects"> = project._id;

		const links = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_membershipId", (q) => q.eq("projectId", projectId))
			.take(51);
		if (links.length > 50)
			throw new Error("This demo supports up to 50 project members.");

		// Project-level backlog for the unassigned count (bounded, shared cap).
		const items = await listProjectFeedback(ctx, projectId);
		const finals = await getFinalStatuses(ctx);
		const maxRank = await getMaxPriorityRank(ctx);
		const priorityRank = await getPriorityRanks(ctx);
		const rankOf = (priority: string) => priorityRank.get(priority) ?? 0;
		let unassigned = 0;
		let critical = 0;
		for (const item of items) {
			if (!isOpen(item, finals)) continue;
			if (item.assigneeId === null) unassigned += 1;
			if (rankOf(item.priority) >= maxRank) critical += 1;
		}

		const members = [];
		for (const link of links) {
			const membership = await ctx.db.get("memberships", link.membershipId);
			if (!membership || membership.organizationId !== project.organizationId)
				continue;
			const user = await ctx.db.get("users", membership.userId);
			if (!user) continue;
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
				if (rankOf(item.priority) >= maxRank) criticalAssigned += 1;
			}
			const scope = await ctx.db
				.query("projectMembers")
				.withIndex("by_membershipId", (q) => q.eq("membershipId", membership._id))
				.take(51);
			members.push({
				id: user._id,
				name: user.name,
				email: user.email,
				role: membership.role,
				projectCount: scope.length,
				openAssigned,
				criticalAssigned,
				lastActivityAt,
				joinedAt: membership.joinedAt,
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

		return {
			project: { name: project.name, slug: project.slug },
			summary: {
				memberCount: members.length,
				coordinatorCount,
				openAssigned,
				unassigned,
				critical,
			},
			members,
		};
	},
});
