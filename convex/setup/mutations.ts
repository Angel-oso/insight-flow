import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { ensureTaxonomies, getTaxonomies } from "../taxonomies/lib";

function slugFromName(name: string) {
	return name
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

/** Creates a workspace the caller owns, with an initial admin project. */
export const createWorkspace = mutation({
	args: { name: v.string(), projectName: v.string() },
	returns: v.object({ projectSlug: v.string(), workspaceName: v.string() }),
	handler: async (ctx, { name: rawName, projectName: rawProjectName }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Sign in to create a workspace.");
		const user = await ctx.db.get("users", userId);
		if (!user) throw new ConvexError("Account not found.");

		const name = rawName.trim().replace(/\s+/g, " ");
		if (!name || name.length > 80) {
			throw new ConvexError("Give the workspace a name between 1 and 80 characters.");
		}
		const projectName = rawProjectName.trim().replace(/\s+/g, " ");
		if (!projectName || projectName.length > 80) {
			throw new ConvexError("Give the first project a name between 1 and 80 characters.");
		}
		const projectSlug = slugFromName(projectName);
		if (!projectSlug) throw new ConvexError("Give the first project a name with letters or numbers.");
		const slug = slugFromName(name);
		if (!slug) {
			throw new ConvexError("Give the workspace a name with letters or numbers.");
		}

		const [existingOrganization, existingProject] = await Promise.all([
			ctx.db
				.query("organizations")
				.withIndex("by_slug", (q) => q.eq("slug", slug))
				.unique(),
			ctx.db
				.query("projects")
				.withIndex("by_slug", (q) => q.eq("slug", projectSlug))
				.unique(),
		]);
		if (existingOrganization || existingProject) {
			throw new ConvexError("That workspace name is already in use.");
		}

		await ctx.runMutation(internal.setup.admin.seedAccessCatalog, {});
		const adminRole = await ctx.db
			.query("roles")
			.withIndex("by_name", (q) => q.eq("name", "admin"))
			.unique();
		if (!adminRole) throw new ConvexError("Could not initialize workspace access.");

		const now = Date.now();
		const organizationId = await ctx.db.insert("organizations", {
			name,
			slug,
			ownerId: userId,
		});
		await ensureTaxonomies(ctx, organizationId);
		const { priorities } = await getTaxonomies(ctx, organizationId);
		const defaultPriority =
			priorities.find((priority) => priority.value === "Medium") ??
			priorities.reduce((lowest, priority) =>
				priority.rank < lowest.rank ? priority : lowest,
			);
		const projectId = await ctx.db.insert("projects", {
			organizationId,
			name: projectName,
			slug: projectSlug,
			description: "The first project in this workspace.",
			status: "Active",
			inboxEnabled: true,
			defaultPriority: defaultPriority.value,
			criticalAlerts: false,
			weeklyDigest: false,
			updatedAt: now,
		});
		await ctx.db.insert("organizationMembers", {
			organizationId,
			userId,
			roleIds: [adminRole._id],
		});
		await ctx.db.insert("projectMembers", {
			projectId,
			userId,
			roleId: adminRole._id,
			joinedAt: now,
		});

		await ctx.db.insert("activities", {
			projectId, actorId: userId, type: "project_created",
			message: `Created project ${projectName}`, createdAt: now,
		});
		return { projectSlug, workspaceName: name };
	},
});
