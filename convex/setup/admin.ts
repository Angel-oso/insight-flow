import { ConvexError, v } from "convex/values";
import type { Capability, Role } from "../../lib/auth/permissions";
import { capabilities } from "../../lib/auth/permissions";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import schema from "../schema";

const defaultGrants: Record<Role, readonly Capability[]> = {
	admin: capabilities,
	manager: [
		"feedback.view",
		"feedback.triage",
		"feedback.assign",
		"feedback.update",
		"feedback.comment",
		"project.view",
		"team.view",
	],
	member: [
		"feedback.view",
		"feedback.update",
		"feedback.comment",
		"project.view",
		"team.view",
	],
};

/** Create catalog records and restore baseline grants without removing custom ones. */
export const seedAccessCatalog = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const permissionIds = new Map<Capability, Id<"permissions">>();
		for (const key of capabilities) {
			const existing = await ctx.db
				.query("permissions")
				.withIndex("by_key", (q) => q.eq("key", key))
				.unique();
			const id = existing?._id ?? await ctx.db.insert("permissions", { key });
			permissionIds.set(key, id);
		}
		for (const name of ["admin", "manager", "member"] as const) {
			const existing = await ctx.db
				.query("roles")
				.withIndex("by_name", (q) => q.eq("name", name))
				.unique();
			if (existing) {
				const baselinePermissionIds = defaultGrants[name].map(
					(key) => permissionIds.get(key)!,
				);
				const mergedPermissionIds = [...new Set([
					...existing.permissionIds,
					...baselinePermissionIds,
				])];
				if (mergedPermissionIds.length !== existing.permissionIds.length) {
					await ctx.db.patch("roles", existing._id, { permissionIds: mergedPermissionIds });
				}
				continue;
			}
			await ctx.db.insert("roles", {
				name,
				permissionIds: defaultGrants[name].map((key) => permissionIds.get(key)!),
			});
		}
		return null;
	},
});

/** Operator-only assignment. Run from Convex CLI after seeding the catalog. */
export const assignUserAccess = internalMutation({
	args: {
		userId: v.id("users"),
		organizationId: v.id("organizations"),
		roleNames: v.array(schema.tables.roles.validator.fields.name),
		projectIds: v.array(v.id("projects")),
	},
	returns: v.null(),
	handler: async (ctx, { userId, organizationId, roleNames, projectIds }) => {
		const [user, organization] = await Promise.all([
			ctx.db.get("users", userId),
			ctx.db.get("organizations", organizationId),
		]);
		if (!user || !organization) throw new ConvexError("User or organization not found.");
		if (!roleNames.length) throw new ConvexError("Assign at least one role.");

		const roleIds: Id<"roles">[] = [];
		for (const name of new Set(roleNames)) {
			const role = await ctx.db
				.query("roles")
				.withIndex("by_name", (q) => q.eq("name", name))
				.unique();
			if (!role) throw new ConvexError(`Role ${name} has not been seeded.`);
			roleIds.push(role._id);
		}

		const projectsToLink = new Set(projectIds);
		if (roleNames.includes("admin")) {
			const organizationProjects = await ctx.db
				.query("projects")
				.withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
				.take(101);
			if (organizationProjects.length > 100) {
				throw new ConvexError("Assign projects in batches for large organizations.");
			}
			for (const project of organizationProjects) projectsToLink.add(project._id);
		}
		for (const projectId of projectsToLink) {
			const project = await ctx.db.get("projects", projectId);
			if (!project || project.organizationId !== organizationId) {
				throw new ConvexError("Project does not belong to this organization.");
			}
			const existing = await ctx.db
				.query("projectMembers")
				.withIndex("by_projectId_userId", (q) =>
					q.eq("projectId", projectId).eq("userId", userId),
				)
				.unique();
			if (!existing) {
				await ctx.db.insert("projectMembers", {
					projectId,
					userId,
					joinedAt: Date.now(),
				});
			}
		}
		if (roleNames.includes("admin") && !(await ctx.db.get("users", organization.ownerId))) {
			await ctx.db.patch("organizations", organizationId, { ownerId: userId });
		}
		const membership = await ctx.db
			.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) =>
				q.eq("organizationId", organizationId).eq("userId", userId),
			)
			.unique();
		if (membership) await ctx.db.patch("organizationMembers", membership._id, { roleIds });
		else await ctx.db.insert("organizationMembers", { organizationId, userId, roleIds });
		return null;
	},
});

/**
 * One-off backfill: copies legacy `users.organizationId` / `users.roleIds`
 * grants into `organizationMembers`, which is now the only source of access.
 * Idempotent and paginated; run until `isDone` is true.
 */
export const migrateLegacyMemberships = internalMutation({
	args: { cursor: v.union(v.string(), v.null()) },
	returns: v.object({
		migrated: v.number(),
		isDone: v.boolean(),
		continueCursor: v.string(),
	}),
	handler: async (ctx, { cursor }) => {
		const page = await ctx.db.query("users").paginate({ cursor, numItems: 100 });
		let migrated = 0;
		for (const user of page.page) {
			if (!user.organizationId || !user.roleIds?.length) continue;
			const organizationId = user.organizationId;
			const existing = await ctx.db
				.query("organizationMembers")
				.withIndex("by_organizationId_userId", (q) =>
					q.eq("organizationId", organizationId).eq("userId", user._id),
				)
				.unique();
			if (existing) continue;
			await ctx.db.insert("organizationMembers", {
				organizationId,
				userId: user._id,
				roleIds: user.roleIds,
			});
			migrated += 1;
		}
		return { migrated, isDone: page.isDone, continueCursor: page.continueCursor };
	},
});
