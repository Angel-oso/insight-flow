import { v } from "convex/values";

import { query } from "../_generated/server";
import { getSessionUserId, requireCapability, requireProject } from "../feedback/access";
import schema from "../schema";
import { capMessage, fullScopeFor } from "./caps";

/** Upper bound for pending links listed at once. */
const PENDING_LIMIT = 100;

/**
 * Pending (not accepted, not expired) invitation links of a project, for
 * people who can manage its team. `now` is the client clock: queries never
 * read the wall clock. Tokens are never returned; a lost link is revoked and
 * created again.
 */
export const pending = query({
	args: { projectSlug: v.string(), now: v.number() },
	returns: v.array(
		v.object({
			id: v.id("projectInvitations"),
			role: schema.tables.roles.validator.fields.name,
			createdBy: v.string(),
			// Recipient of an invitation sent by email; null for shared links.
			email: v.union(v.string(), v.null()),
			createdAt: v.number(),
			expiresAt: v.number(),
		}),
	),
	handler: async (ctx, { projectSlug, now }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "team.manage");
		const links = await ctx.db
			.query("projectInvitations")
			.withIndex("by_projectId_acceptedAt_expiresAt", (q) =>
				q.eq("projectId", project._id).eq("acceptedAt", undefined).gt("expiresAt", now),
			)
			.take(PENDING_LIMIT);
		return Promise.all(
			links.map(async (link) => {
				const [role, creator] = await Promise.all([
					ctx.db.get("roles", link.roleId),
					ctx.db.get("users", link.createdBy),
				]);
				return {
					id: link._id,
					role: role?.name ?? "member",
					createdBy: creator?.name ?? "Former member",
					email: link.email ?? null,
					createdAt: link._creationTime,
					expiresAt: link.expiresAt,
				};
			}),
		);
	},
});

/**
 * What the invite dialog needs to know before anyone fills it in: whether
 * a member cap blocks new invitations (with the message to show) and
 * whether the caller may send by email (verified address required).
 */
export const inviteStatus = query({
	args: { projectSlug: v.string() },
	returns: v.object({
		full: v.union(v.literal("project"), v.literal("organization"), v.null()),
		message: v.union(v.string(), v.null()),
		canEmail: v.boolean(),
	}),
	handler: async (ctx, { projectSlug }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "team.manage");
		const full = await fullScopeFor(ctx, project);
		return {
			full,
			message: full ? capMessage(full) : null,
			canEmail: !!access.user.email && access.user.emailVerificationTime !== undefined,
		};
	},
});

export const preview = query({
	args: { token: v.string() },
	returns: v.union(
		v.object({
			projectName: v.string(),
			projectSlug: v.string(),
			role: schema.tables.roles.validator.fields.name,
			expiresAt: v.number(),
			// Expiry is derived on the client from expiresAt: queries never
			// read the clock, so a cached result cannot go stale.
			status: v.union(v.literal("pending"), v.literal("accepted")),
		}),
		v.null(),
	),
	handler: async (ctx, { token }) => {
		// Only signed-in visitors (the invitee) can read invitation details.
		if (!(await getSessionUserId(ctx))) return null;
		const invitation = await ctx.db
			.query("projectInvitations")
			.withIndex("by_token", (q) => q.eq("token", token))
			.unique();
		if (!invitation) return null;
		const [project, role] = await Promise.all([
			ctx.db.get("projects", invitation.projectId),
			ctx.db.get("roles", invitation.roleId),
		]);
		if (!project || !role || project.deletionRequestedAt !== undefined) return null;
		const organization = await ctx.db.get("organizations", project.organizationId);
		if (!organization || organization.deletionRequestedAt !== undefined) return null;
		const status = invitation.acceptedAt ? ("accepted" as const) : ("pending" as const);
		return {
			projectName: project.name,
			projectSlug: project.slug,
			role: role.name,
			expiresAt: invitation.expiresAt,
			status,
		};
	},
});
