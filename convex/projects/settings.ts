import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCapability, requireProject } from "../feedback/access";
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
});

const roleSummary = v.object({
	id: v.id("roles"),
	name: v.string(),
	permissionKeys: v.array(schema.tables.permissions.validator.fields.key),
	builtIn: v.boolean(),
});

const baseRoleNames = ["admin", "manager", "member"] as const;
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
			const { priorities } = await getTaxonomies(ctx);
			if (!priorities.some((entry) => entry.value === changes.defaultPriority)) {
				throw new ConvexError(`Unknown priority: ${changes.defaultPriority}.`);
			}
			patch.defaultPriority = changes.defaultPriority;
			changed = true;
		}

		if (!changed) return null;
		await ctx.db.patch("projects", project._id, patch);
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
	returns: v.object({ canManageRoles: v.boolean(), roles: v.array(roleSummary) }),
	handler: async (ctx, { projectSlug }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		if (!access.permissions.includes("organization.manage")) {
			return { canManageRoles: false, roles: [] };
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
			.take(51);
		if (customRoles.length > 50) throw new ConvexError("This project supports up to 50 custom roles.");
		return {
			canManageRoles: true,
			roles: await Promise.all([...baseRoles, ...customRoles].map((role) => roleSummaryFor(ctx, role!))),
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
		return roleSummaryFor(ctx, { _id: roleId, name, permissionIds, projectId: project._id });
	},
});

export const deleteRole = mutation({
	args: { projectSlug: v.string(), roleId: v.id("roles") },
	returns: v.null(),
	handler: async (ctx, { projectSlug, roleId }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "organization.manage");
		const [role, memberRole] = await Promise.all([
			ctx.db.get("roles", roleId),
			ctx.db.query("roles").withIndex("by_name", (q) => q.eq("name", "member")).unique(),
		]);
		if (!role || role.projectId !== project._id) {
			throw new ConvexError("Built-in roles cannot be deleted.");
		}
		if (!memberRole) throw new ConvexError("Workspace roles are not initialized.");
		const [members, invitations] = await Promise.all([
			ctx.db.query("projectMembers").withIndex("by_projectId_userId", (q) => q.eq("projectId", project._id)).take(51),
			ctx.db.query("projectInvitations").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).take(101),
		]);
		if (members.length > 50 || invitations.length > 100) {
			throw new ConvexError("Delete this role after reducing this project's members or invitations.");
		}
		for (const member of members) {
			if (member.roleId === role._id) await ctx.db.patch("projectMembers", member._id, { roleId: memberRole._id });
		}
		for (const invitation of invitations) {
			if (invitation.roleId === role._id && !invitation.acceptedAt) {
				await ctx.db.patch("projectInvitations", invitation._id, { roleId: memberRole._id });
			}
		}
		await ctx.db.delete("roles", role._id);
		return null;
	},
});
