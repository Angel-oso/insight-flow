import { ConvexError, v } from "convex/values";
import { logAudit } from "../audit/log";
import { mutation, query } from "../_generated/server";
import { PROJECT_MEMBER_LIMIT, requireCapability, requireProject, requireUserId } from "../feedback/access";
import { getTaxonomies } from "../taxonomies/lib";
import schema from "../schema";

const settingsChanges = v.object({
	name: v.optional(v.string()),
	description: v.optional(v.string()),
	status: v.optional(schema.tables.projects.validator.fields.status),
	inboxEnabled: v.optional(v.boolean()),
	defaultPriority: v.optional(
		schema.tables.projects.validator.fields.defaultPriority,
	),
	// Email notifications to members who can triage (convex/notifications).
	criticalAlerts: v.optional(v.boolean()),
	weeklyDigest: v.optional(v.boolean()),
});

const roleSummary = v.object({
	id: v.id("roles"),
	name: v.string(),
	permissionKeys: v.array(schema.tables.permissions.validator.fields.key),
	builtIn: v.boolean(),
});

const baseRoleNames = ["admin", "manager", "member"] as const;
/** Custom roles one project can define. */
export const MAX_CUSTOM_ROLES = 30;
/**
 * Custom roles read by the roles list. Above the creation cap so projects
 * that predate it still load (no throw); only the first ones are listed.
 */
const CUSTOM_ROLE_READ_LIMIT = 60;
/** Pending invitation links reassigned when a role is deleted. */
const PENDING_LINK_LIMIT = 1000;
const requiredMemberPermissions = ["feedback.view", "project.view", "team.view"] as const;

async function roleSummaryFor(
	ctx: Parameters<typeof getTaxonomies>[0],
	role: { _id: import("../_generated/dataModel").Id<"roles">; name: string; permissionIds: import("../_generated/dataModel").Id<"permissions">[]; projectId?: import("../_generated/dataModel").Id<"projects"> },
) {
	const permissions = await Promise.all(
		role.permissionIds.map((permissionId) => ctx.db.get("permissions", permissionId)),
	);
	if (permissions.some((permission) => permission === null)) {
		throw new ConvexError("This role has an invalid permission.");
	}
	return {
		id: role._id,
		name: role.name,
		permissionKeys: permissions.map((permission) => permission!.key),
		builtIn: role.projectId === undefined,
	};
}

export const get = query({
	args: { projectSlug: v.string() },
	returns: v.object({ project: schema.doc("projects") }),
	handler: async (ctx, { projectSlug }) => {
		const { project } = await requireProject(ctx, projectSlug);
		return { project };
	},
});

export const update = mutation({
	args: { projectSlug: v.string(), changes: settingsChanges },
	returns: v.null(),
	handler: async (ctx, { projectSlug, changes }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "project.manage");
		if (project.status === "Archived")
			throw new ConvexError("Archived projects cannot be edited.");

		const patch: {
			name?: string;
			description?: string;
			status?: "Active" | "Paused" | "Archived";
			inboxEnabled?: boolean;
			defaultPriority?: string;
			criticalAlerts?: boolean;
			weeklyDigest?: boolean;
			updatedAt: number;
		} = { updatedAt: Date.now() };
		let changed = false;

		if (changes.name !== undefined) {
			const name = changes.name.trim();
			if (name.length === 0 || name.length > 80)
				throw new ConvexError("Give the project a name between 1 and 80 characters.");
			if (name !== project.name) {
				patch.name = name;
				changed = true;
			}
		}
		if (changes.description !== undefined) {
			const description = changes.description.trim();
			if (description.length > 500)
				throw new ConvexError("Keep the description under 500 characters.");
			if (description !== project.description) {
				patch.description = description;
				changed = true;
			}
		}
		if (
			changes.status !== undefined &&
			changes.status !== project.status
		) {
			patch.status = changes.status;
			changed = true;
		}
		if (
			changes.inboxEnabled !== undefined &&
			changes.inboxEnabled !== project.inboxEnabled
		) {
			patch.inboxEnabled = changes.inboxEnabled;
			changed = true;
		}
		if (
			changes.defaultPriority !== undefined &&
			changes.defaultPriority !== project.defaultPriority
		) {
			const { priorities } = await getTaxonomies(ctx, project.organizationId);
			if (!priorities.some((entry) => entry.value === changes.defaultPriority)) {
				throw new ConvexError(`Unknown priority: ${changes.defaultPriority}.`);
			}
			patch.defaultPriority = changes.defaultPriority;
			changed = true;
		}
		for (const field of ["criticalAlerts", "weeklyDigest"] as const) {
			if (changes[field] !== undefined && changes[field] !== project[field]) {
				patch[field] = changes[field];
				changed = true;
			}
		}

		if (!changed) return null;
		await ctx.db.patch("projects", project._id, patch);
		return null;
	},
});

/** Archive is reversible: managers bring a project back to Active. */
export const restore = mutation({
	args: { projectSlug: v.string() },
	returns: v.null(),
	handler: async (ctx, { projectSlug }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "project.manage");
		if (project.status !== "Archived")
			throw new ConvexError("Only archived projects can be restored.");
		await ctx.db.patch("projects", project._id, {
			status: "Active",
			updatedAt: Date.now(),
		});
		return null;
	},
});

/**
 * The caller's project grants, server-decided for capability UI.
 * Returns null for anonymous callers and non-members so the settings
 * page can hide itself exactly like a denied reader.
 */
export const access = query({
	args: { projectSlug: v.string() },
	returns: v.union(v.object({
		role: schema.tables.roles.validator.fields.name,
		permissions: v.array(schema.tables.permissions.validator.fields.key),
	}), v.null()),
	handler: async (ctx, { projectSlug }) => {
		try {
			const { access } = await requireProject(ctx, projectSlug);
			return { role: access.role, permissions: access.permissions };
		} catch {
			return null;
		}
	},
});

/** Project roles are visible only to administrators because they expose grants. */
export const roles = query({
	args: { projectSlug: v.string() },
	returns: v.object({
		canManageRoles: v.boolean(),
		roles: v.array(roleSummary),
		customRoleLimit: v.number(),
	}),
	handler: async (ctx, { projectSlug }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		if (!access.permissions.includes("organization.manage")) {
			return { canManageRoles: false, roles: [], customRoleLimit: MAX_CUSTOM_ROLES };
		}
		const baseRoles = await Promise.all(
			baseRoleNames.map((name) =>
				ctx.db.query("roles").withIndex("by_name", (q) => q.eq("name", name)).unique(),
			),
		);
		if (baseRoles.some((role) => !role)) {
			throw new ConvexError("Workspace roles are not initialized.");
		}
		const customRoles = await ctx.db
			.query("roles")
			.withIndex("by_projectId", (q) => q.eq("projectId", project._id))
			.take(CUSTOM_ROLE_READ_LIMIT);
		return {
			canManageRoles: true,
			roles: await Promise.all([...baseRoles, ...customRoles].map((role) => roleSummaryFor(ctx, role!))),
			customRoleLimit: MAX_CUSTOM_ROLES,
		};
	},
});

export const createRole = mutation({
	args: {
		projectSlug: v.string(),
		name: v.string(),
		permissionKeys: v.array(schema.tables.permissions.validator.fields.key),
	},
	returns: roleSummary,
	handler: async (ctx, { projectSlug, name: rawName, permissionKeys }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "organization.manage");
		if (project.status === "Archived")
			throw new ConvexError("Archived projects cannot be edited.");
		const name = rawName.trim().replace(/\s+/g, " ");
		if (name.length < 2 || name.length > 40) {
			throw new ConvexError("Give the role a name between 2 and 40 characters.");
		}
		if (baseRoleNames.includes(name.toLowerCase() as (typeof baseRoleNames)[number])) {
			throw new ConvexError("Built-in roles cannot be recreated.");
		}
		const existing = await ctx.db
			.query("roles")
			.withIndex("by_projectId_name", (q) => q.eq("projectId", project._id).eq("name", name))
			.unique();
		if (existing) throw new ConvexError("A role with this name already exists in this project.");
		const customRoles = await ctx.db
			.query("roles")
			.withIndex("by_projectId", (q) => q.eq("projectId", project._id))
			.take(MAX_CUSTOM_ROLES);
		if (customRoles.length >= MAX_CUSTOM_ROLES)
			throw new ConvexError(
				`A project can have up to ${MAX_CUSTOM_ROLES} custom roles. Delete one you no longer use first.`,
			);
		const selected = new Set([...requiredMemberPermissions, ...permissionKeys]);
		selected.delete("organization.manage");
		const permissionIds = await Promise.all([...selected].map(async (key) => {
			const permission = await ctx.db
				.query("permissions")
				.withIndex("by_key", (q) => q.eq("key", key))
				.unique();
			if (!permission) throw new ConvexError("Workspace permissions are not initialized.");
			return permission._id;
		}));
		const roleId = await ctx.db.insert("roles", { name, permissionIds, projectId: project._id });
		await logAudit(ctx, {
			organizationId: project.organizationId,
			projectId: project._id,
			actorId: await requireUserId(ctx),
			action: "project.role_created",
			summary: `Created the role "${name}" in ${project.name}`,
		});
		return roleSummaryFor(ctx, { _id: roleId, name, permissionIds, projectId: project._id });
	},
});

export const deleteRole = mutation({
	args: { projectSlug: v.string(), roleId: v.id("roles") },
	returns: v.null(),
	handler: async (ctx, { projectSlug, roleId }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "organization.manage");
		if (project.status === "Archived")
			throw new ConvexError("Archived projects cannot be edited.");
		const [role, memberRole] = await Promise.all([
			ctx.db.get("roles", roleId),
			ctx.db.query("roles").withIndex("by_name", (q) => q.eq("name", "member")).unique(),
		]);
		if (!role || role.projectId !== project._id) {
			throw new ConvexError("Built-in roles cannot be deleted.");
		}
		if (!memberRole) throw new ConvexError("Workspace roles are not initialized.");
		const members = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", project._id))
			.take(PROJECT_MEMBER_LIMIT + 1);
		if (members.length > PROJECT_MEMBER_LIMIT)
			throw new ConvexError(`This project supports up to ${PROJECT_MEMBER_LIMIT} project members.`);
		for (const member of members) {
			if (member.roleId === role._id) await ctx.db.patch("projectMembers", member._id, { roleId: memberRole._id });
		}
		// Only links that can still be accepted matter: pending (no
		// acceptedAt) and unexpired. Used or expired links are history the
		// daily cleanup removes; accepting one fails without its role.
		const now = Date.now();
		let pending = 0;
		for await (const invitation of ctx.db
			.query("projectInvitations")
			.withIndex("by_projectId_acceptedAt_expiresAt", (q) =>
				q.eq("projectId", project._id).eq("acceptedAt", undefined).gt("expiresAt", now),
			)) {
			if (++pending > PENDING_LINK_LIMIT)
				throw new ConvexError("This project has too many open invitation links. Revoke some, then delete the role.");
			if (invitation.roleId === role._id)
				await ctx.db.patch("projectInvitations", invitation._id, { roleId: memberRole._id });
		}
		await ctx.db.delete("roles", role._id);
		await logAudit(ctx, {
			organizationId: project.organizationId,
			projectId: project._id,
			actorId: await requireUserId(ctx),
			action: "project.role_deleted",
			summary: `Deleted the role "${role.name}" in ${project.name}; its members became members`,
		});
		return null;
	},
});
