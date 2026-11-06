import { ConvexError, v } from "convex/values";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveOrganizationAccess, resolveProjectAccess } from "../access/roles";
import { logAudit } from "../audit/log";
import { mutation } from "../_generated/server";
import { requireUserId } from "../feedback/access";
import { getTaxonomies } from "../taxonomies/lib";
import { slugify, uniqueSlug } from "../lib/slugs";
import { enforceRateLimit } from "../rateLimits";

// Matches the organization overview's read bound (ORGANIZATION_PROJECT_LIMIT).
export const MAX_PROJECTS_PER_ORGANIZATION = 50;

export const create = mutation({
	args: { currentProjectSlug: v.optional(v.string()), organizationId: v.optional(v.id("organizations")), name: v.string(), description: v.string() },
	returns: v.object({
		slug: v.string(),
		name: v.string(),
		description: v.string(),
	}),
	handler: async (ctx, { currentProjectSlug, organizationId: selectedOrganizationId, name: rawName, description: rawDescription }) => {
		const userId = await requireUserId(ctx);
		const currentProject = currentProjectSlug ? await ctx.db.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", currentProjectSlug)).unique() : null;
		const organizationId = selectedOrganizationId ?? currentProject?.organizationId;
		const access = organizationId ? await resolveOrganizationAccess(ctx, userId, organizationId) : null;
		const projectAccess = currentProject ? await resolveProjectAccess(ctx, userId, currentProject._id) : null;
		if (!organizationId || !access || !hasCapability(access.permissions, "organization.manage") ||
			(currentProjectSlug !== undefined && (!currentProject || currentProject.organizationId !== organizationId || !projectAccess?.permissions.includes("organization.manage"))))
			throw new ConvexError("You cannot create projects in this workspace.");

		const name = rawName.trim().replace(/\s+/g, " ");
		const description = rawDescription.trim();
		if (!name || name.length > 80)
			throw new ConvexError("Give the project a name between 1 and 80 characters.");
		if (description.length > 500)
			throw new ConvexError("Keep the description under 500 characters.");
		if (!slugify(name)) throw new ConvexError("Give the project a name with letters or numbers.");

		// Organization views read a bounded number of projects, so
		// creation stops there. Names stay unique within the organization (the
		// caller can already see them); slugs are global and get a random suffix
		// on collision so other tenants' names are never revealed.
		// Only live projects count: projects being deleted are excluded by the
		// index range itself, so the read stays bounded by the limit.
		const siblings = await ctx.db
			.query("projects")
			.withIndex("by_organizationId_deletionRequestedAt", (q) =>
				q.eq("organizationId", organizationId).eq("deletionRequestedAt", undefined),
			)
			.take(MAX_PROJECTS_PER_ORGANIZATION);
		if (siblings.length >= MAX_PROJECTS_PER_ORGANIZATION)
			throw new ConvexError(`A workspace can have up to ${MAX_PROJECTS_PER_ORGANIZATION} projects.`);
		if (siblings.some((project) => project.name.toLowerCase() === name.toLowerCase()))
			throw new ConvexError("This workspace already has a project with this name.");
		await enforceRateLimit(ctx, "createProject", userId);
		const slug = (await uniqueSlug(ctx, "projects", name))!;

		const [{ priorities }, projectRole] = await Promise.all([
			getTaxonomies(ctx, organizationId),
			ctx.db
				.query("roles")
				.withIndex("by_name", (q) => q.eq("name", access.role))
				.unique(),
		]);
		const defaultPriority =
			priorities.find((priority) => priority.value === "Medium") ??
			priorities.reduce((lowest, priority) =>
				priority.rank < lowest.rank ? priority : lowest,
			);
		const now = Date.now();
		const projectId = await ctx.db.insert("projects", {
			organizationId,
			name,
			slug,
			description: description || "New project workspace.",
			status: "Active",
			// The public form starts closed: slugs are guessable, so admins
			// open it on purpose from project settings.
			inboxEnabled: false,
			defaultPriority: defaultPriority.value,
			criticalAlerts: false,
			weeklyDigest: false,
			updatedAt: now,
		});
		await ctx.db.insert("projectMembers", {
			projectId,
			userId,
			...(projectRole ? { roleId: projectRole._id } : {}),
			joinedAt: now,
		});

		await ctx.db.insert("activities", {
			projectId, actorId: userId, type: "project_created",
			message: `Created project ${name}`, createdAt: now,
		});
		await logAudit(ctx, {
			organizationId,
			projectId,
			actorId: userId,
			action: "project.created",
			summary: `Created project ${name}`,
		});
		return { slug, name, description: description || "New project workspace." };
	},
});
