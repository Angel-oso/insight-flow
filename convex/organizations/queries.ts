import { ConvexError, v } from "convex/values";
import { resolveOrganizationAccess, resolveProjectAccess } from "../access/roles";
import { query } from "../_generated/server";
import { listProjectFeedback, requireProject, requireUserId } from "../feedback/access";
import { getFinalStatuses, getPriorityRanks } from "../taxonomies/lib";
import { requireOrganization } from "./access";

/** MVP health is transparent: 20+ open items is a clearly high backlog. */
export const HIGH_OPEN_BACKLOG = 20;
export const ORGANIZATION_PROJECT_LIMIT = 50;
const dayMs = 86_400_000;

function healthFor(open: number, critical: number) {
	if (critical > 0 || open >= HIGH_OPEN_BACKLOG) return "At risk" as const;
	return open > 0 ? "Needs attention" as const : "Healthy" as const;
}

function inRange(at: number | undefined, start: number, end: number) {
	return at !== undefined && at >= start && at < end;
}

export const mine = query({
	args: {},
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const memberships = await ctx.db.query("organizationMembers")
			.withIndex("by_userId", (q) => q.eq("userId", userId)).take(101);
		if (memberships.length > 100) {
			throw new ConvexError("This workspace supports up to 100 organization memberships.");
		}
		const rows = await Promise.all(memberships.map(async ({ organizationId }) => {
			const access = await resolveOrganizationAccess(ctx, userId, organizationId);
			const organization = await ctx.db.get("organizations", organizationId);
			return access && organization ? {
				id: organizationId,
				name: organization.name,
				slug: organization.slug,
				isAdmin: access.permissions.includes("organization.manage"),
			} : null;
		}));
		return rows.filter((row) => row !== null);
	},
});

/** The first visible project determines the default organization in the UI. */
export const organizationForProject = query({
	args: { projectSlug: v.string() },
	handler: async (ctx, { projectSlug }) =>
		(await requireProject(ctx, projectSlug)).project.organizationId,
});

export const overview = query({
	args: { organizationId: v.id("organizations"), from: v.number(), to: v.number() },
	handler: async (ctx, { organizationId, from, to }) => {
		const { userId, isAdmin, organization } = await requireOrganization(ctx, organizationId);
		if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > 365 * dayMs) {
			throw new ConvexError("Choose a valid date window of at most 365 days.");
		}
		const projects = await ctx.db.query("projects")
			.withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
			.take(ORGANIZATION_PROJECT_LIMIT + 1);
		if (projects.length > ORGANIZATION_PROJECT_LIMIT) {
			throw new ConvexError("This overview supports up to 50 projects per organization.");
		}
		const [finals, ranks] = await Promise.all([
			getFinalStatuses(ctx, organizationId), getPriorityRanks(ctx, organizationId),
		]);
		const topRank = Math.max(...ranks.values());
		const previousStart = from - (to - from);
		const rows = await Promise.all(projects.map(async (project) => {
			const access = await resolveProjectAccess(ctx, userId, project._id);
			const canOpen = Boolean(
				access?.permissions.includes("project.view") && access.permissions.includes("feedback.view"),
			);
			// Non-admins do not even read unrelated project feedback or activity.
			if (!isAdmin && !canOpen) return null;
			const items = await listProjectFeedback(ctx, project._id);
			const openItems = items.filter((item) => !finals.has(item.status));
			const open = openItems.length;
			const critical = openItems.filter((item) => ranks.get(item.priority) === topRank).length;
			const received = items.filter((item) => inRange(item.receivedAt, from, to)).length;
			// Same rule as the project overview: any final status resolves an
			// item. Taxonomies are editable, so no status literal is assumed.
			const completedItems = items.filter((item) => finals.has(item.status));
			const completed = completedItems.length;
			const activities = isAdmin ? await ctx.db.query("activities")
				.withIndex("by_projectId_createdAt", (q) => q.eq("projectId", project._id))
				.order("desc").take(15) : [];
			const latestActivityAt = Math.max(
				project._creationTime,
				...items.map((item) => item.updatedAt),
				...activities.map((activity) => activity.createdAt),
			);
			return {
				canOpen,
				summary: {
					slug: project.slug, name: project.name, description: project.description,
					status: project.status, open, critical,
				},
				health: {
					slug: project.slug, name: project.name, received, open, critical, completed,
					total: items.length, resolutionRate: items.length ? completed / items.length : 0,
					latestActivityAt, health: healthFor(open, critical),
				},
				metrics: {
					received,
					receivedPrevious: items.filter((item) => inRange(item.receivedAt, previousStart, from)).length,
					open, critical,
					completedInRange: completedItems.filter((item) => inRange(item.completedAt, from, to)).length,
					completedPrevious: completedItems.filter((item) => inRange(item.completedAt, previousStart, from)).length,
					total: items.length,
				},
				activities: activities.map((activity) => ({
					...activity, projectName: project.name, projectSlug: project.slug,
				})),
			};
		}));
		const visibleRows = rows.filter((row) => row !== null);
		const visibleProjects = visibleRows.filter((row) => row.canOpen)
			.map((row) => row.summary).sort((a, b) => a.name.localeCompare(b.name));
		const organizationSummary = { id: organizationId, name: organization.name };
		if (!isAdmin) return { organization: organizationSummary, projects: visibleProjects, admin: null };

		const metrics = visibleRows.reduce((sum, row) => ({
			received: sum.received + row.metrics.received,
			receivedPrevious: sum.receivedPrevious + row.metrics.receivedPrevious,
			open: sum.open + row.metrics.open,
			critical: sum.critical + row.metrics.critical,
			completedInRange: sum.completedInRange + row.metrics.completedInRange,
			completedPrevious: sum.completedPrevious + row.metrics.completedPrevious,
			total: sum.total + row.metrics.total,
		}), {
			received: 0, receivedPrevious: 0, open: 0, critical: 0,
			completedInRange: 0, completedPrevious: 0, total: 0,
		});
		// Taking 15 per project is sufficient to find the global latest 15.
		const latest = visibleRows.flatMap((row) => row.activities)
			.sort((a, b) => b.createdAt - a.createdAt).slice(0, 15);
		const activities = await Promise.all(latest.map(async (activity) => ({
			id: activity._id,
			feedbackId: activity.feedbackId ?? null,
			actor: activity.actorId
				? (await ctx.db.get("users", activity.actorId))?.name ?? "Former member"
				: "System",
			projectName: activity.projectName,
			projectSlug: activity.projectSlug,
			message: activity.message,
			createdAt: activity.createdAt,
			type: activity.type,
		})));
		return {
			organization: organizationSummary,
			projects: visibleProjects,
			admin: {
				metrics,
				health: visibleRows.map((row) => row.health)
					.sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)),
				activities,
			},
		};
	},
});

export const settings = query({
	args: { organizationId: v.id("organizations") },
	handler: async (ctx, { organizationId }) => {
		const { userId, organization } = await requireOrganization(ctx, organizationId, true);
		const memberships = await ctx.db.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) => q.eq("organizationId", organizationId))
			.take(201);
		if (memberships.length > 200) {
			throw new ConvexError("These settings support up to 200 organization members.");
		}
		const eligible = await Promise.all(memberships.map(async (membership) => {
			const access = await resolveOrganizationAccess(ctx, membership.userId, organizationId);
			return access?.permissions.includes("organization.manage")
				? { id: membership.userId, name: access.user.name ?? "Team member" }
				: null;
		}));
		const owner = await ctx.db.get("users", organization.ownerId);
		return {
			name: organization.name,
			ownerName: owner?.name ?? "Former member",
			ownerId: organization.ownerId,
			isOwner: userId === organization.ownerId,
			eligibleAdmins: eligible.filter((row) => row !== null)
				.sort((a, b) => a.name.localeCompare(b.name)),
		};
	},
});
