import { ConvexError, v } from "convex/values";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveOrganizationAccess, resolveProjectAccess } from "../access/roles";
import { mutation } from "../_generated/server";
import { requireUserId } from "../feedback/access";
import { getTaxonomies } from "../taxonomies/lib";

function slugFromName(name: string) {
	return name
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

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
		const slug = slugFromName(name);
		if (!slug) throw new ConvexError("Give the project a name with letters or numbers.");
		const existing = await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.unique();
		if (existing) throw new ConvexError("A project with this name already exists.");

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
			inboxEnabled: true,
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
		return { slug, name, description: description || "New project workspace." };
	},
});
