import { getSessionUserId } from "../feedback/access";
import { ConvexError, v } from "convex/values";

import { logAudit } from "../audit/log";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { slugify, uniqueSlug } from "../lib/slugs";
import { enforceRateLimit, MAX_OWNED_ORGANIZATIONS } from "../rateLimits";
import { ensureTaxonomies, getTaxonomies } from "../taxonomies/lib";

// Upper bound on memberships scanned when counting owned organizations.
const MEMBERSHIP_SCAN_LIMIT = 200;

/** Creates a workspace the caller owns, with an initial admin project. */
export const createWorkspace = mutation({
	args: { name: v.string(), projectName: v.string() },
	returns: v.object({ projectSlug: v.string(), workspaceName: v.string() }),
	handler: async (ctx, { name: rawName, projectName: rawProjectName }) => {
		const userId = await getSessionUserId(ctx);
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
		if (!slugify(projectName)) throw new ConvexError("Give the first project a name with letters or numbers.");
		if (!slugify(name)) {
			throw new ConvexError("Give the workspace a name with letters or numbers.");
		}

		const memberships = await ctx.db
			.query("organizationMembers")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(MEMBERSHIP_SCAN_LIMIT);
		const organizations = await Promise.all(
			memberships.map((membership) => ctx.db.get("organizations", membership.organizationId)),
		);
		// Organizations being deleted no longer count against the limit.
		const owned = organizations.filter(
			(organization) => organization?.ownerId === userId && organization.deletionRequestedAt === undefined,
		).length;
		if (owned >= MAX_OWNED_ORGANIZATIONS) {
			throw new ConvexError(
				`You can own up to ${MAX_OWNED_ORGANIZATIONS} workspaces. Transfer ownership of one to create another.`,
			);
		}
		await enforceRateLimit(ctx, "createWorkspace", userId);

		// Slugs are global; collisions get a random suffix instead of an error
		// so other tenants' names are never revealed or blocked.
		const slug = (await uniqueSlug(ctx, "organizations", name))!;
		const projectSlug = (await uniqueSlug(ctx, "projects", projectName))!;

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
			// The public form starts closed: slugs are guessable, so admins
			// open it on purpose from project settings.
			inboxEnabled: false,
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
		await logAudit(ctx, {
			organizationId,
			projectId,
			actorId: userId,
			action: "project.created",
			summary: `Created the workspace with project ${projectName}`,
		});
		return { projectSlug, workspaceName: name };
	},
});
