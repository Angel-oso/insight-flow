import { ConvexError, v } from "convex/values";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveProjectAccess } from "../access/roles";
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
	args: { currentProjectSlug: v.string(), name: v.string(), description: v.string() },
	returns: v.object({
		slug: v.string(),
		name: v.string(),
		description: v.string(),
	}),
	handler: async (ctx, { currentProjectSlug, name: rawName, description: rawDescription }) => {
		const userId = await requireUserId(ctx);
		const currentProject = await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", currentProjectSlug))
			.unique();
		const access = currentProject
			? await resolveProjectAccess(ctx, userId, currentProject._id)
			: null;
		if (
			!currentProject ||
			!access ||
			!hasCapability(access.permissions, "organization.manage")
		)
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
			getTaxonomies(ctx, currentProject.organizationId),
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
			organizationId: currentProject.organizationId,
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

		return { slug, name, description: description || "New project workspace." };
	},
});
