import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import { logAudit } from "../audit/log";
import { requireUserId } from "../feedback/access";
import { retireSlug } from "../lib/slugs";
import {
	cancelPurgeJob,
	isRestorable,
	markProjectDeleting,
	purgeProjectStep,
	RESTORE_WINDOW_MS,
	unmarkProject,
} from "../projects/deletion";
import { enforceUserRateLimit, MAX_OWNED_ORGANIZATIONS } from "../rateLimits";
import { requireOrganization } from "./access";

/**
 * Organization deletion (owner only, organization name typed as
 * confirmation), with a 7-day restore window.
 *
 * `remove` marks the organization and all of its live projects
 * (`withOrganization`), so resolveOrganizationAccess / requireProject /
 * resolveProjectAccess treat them as gone immediately, and schedules
 * `purge` for RESTORE_WINDOW_MS later. Within the window the owner can
 * `restore` it (projects deleted on their own before stay deleted). When
 * the owner deletes their account, the purge runs at once instead
 * (`requestOrganizationDeletion(…, { immediate: true })`): nobody could
 * restore it anymore.
 *
 * `purge` re-checks the organization still carries the request it was
 * scheduled for, then works in bounded, self-scheduling steps: each project
 * is purged with the same steps as a single project deletion, then
 * organization memberships, taxonomies and audit entries are removed, and
 * finally the organization document (its slug is retired only then).
 */

/**
 * Projects marked or restored in one transaction. Both read only the live
 * projects (creation caps them at 50) or the ones marked with the
 * organization, never projects deleted on their own earlier (those linger
 * for 7 days and are not bounded by that cap).
 */
const MARK_LIMIT = 100;
const MEMBER_BATCH = 400;
const AUDIT_BATCH = 400;

/**
 * Marks `organization` as deleted and schedules its purge, or with
 * `immediate` (account deletion) purges it right away, also when it was
 * already marked. Returns false when nothing changed.
 */
export async function requestOrganizationDeletion(
	ctx: MutationCtx,
	organization: Doc<"organizations">,
	{ actorId, immediate = false }: { actorId: Id<"users">; immediate?: boolean },
) {
	const organizationId = organization._id;
	let requestedAt = organization.deletionRequestedAt;
	if (requestedAt === undefined) {
		requestedAt = Date.now();
		await ctx.db.patch("organizations", organizationId, { deletionRequestedAt: requestedAt });
		// Every project marked here carries exactly `requestedAt`, which is how
		// `restore` finds them again. Anything beyond the bound is still hidden
		// (isProjectDeleted checks the organization) and marked by `purge`.
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_organizationId_deletionRequestedAt", (q) =>
				q.eq("organizationId", organizationId).eq("deletionRequestedAt", undefined),
			)
			.take(MARK_LIMIT);
		for (const project of projects) await markProjectDeleting(ctx, project, requestedAt, true);
		await logAudit(ctx, {
			organizationId,
			actorId,
			action: "organization.deletion_requested",
			summary: immediate
				? `Deleted organization ${organization.name} with the owner's account`
				: `Deleted organization ${organization.name} (restorable for 7 days)`,
		});
	} else if (!immediate) {
		return false;
	} else {
		// Already waiting out the window: drop that job and purge now.
		await cancelPurgeJob(ctx, organization.purgeJobId);
	}
	const purgeJobId = await ctx.scheduler.runAfter(
		immediate ? 0 : RESTORE_WINDOW_MS,
		internal.organizations.deletion.purge,
		{ organizationId, requestedAt },
	);
	await ctx.db.patch("organizations", organizationId, { purgeJobId });
	return true;
}

export const remove = mutation({
	args: { organizationId: v.id("organizations"), confirmName: v.string() },
	returns: v.null(),
	handler: async (ctx, { organizationId, confirmName }) => {
		await enforceUserRateLimit(ctx, "deleteWorkspaceData");
		const { userId, organization } = await requireOrganization(ctx, organizationId, true);
		if (organization.ownerId !== userId)
			throw new ConvexError("Only the organization owner can delete it.");
		if (confirmName.trim() !== organization.name)
			throw new ConvexError("Type the organization name exactly to confirm.");
		await requestOrganizationDeletion(ctx, organization, { actorId: userId });
		return null;
	},
});

/** The owner brings a deleted organization (and its projects) back. */
export const restore = mutation({
	args: { organizationId: v.id("organizations") },
	returns: v.null(),
	handler: async (ctx, { organizationId }) => {
		await enforceUserRateLimit(ctx, "restoreWorkspaceData");
		const userId = await requireUserId(ctx);
		const organization = await ctx.db.get("organizations", organizationId);
		// Same answer for "not yours" and "does not exist".
		if (!organization || organization.ownerId !== userId || organization.deletionRequestedAt === undefined)
			throw new ConvexError("Organization not found.");
		const membership = await ctx.db
			.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) =>
				q.eq("organizationId", organizationId).eq("userId", userId),
			)
			.unique();
		if (!membership) throw new ConvexError("Organization not found.");
		const now = Date.now();
		if (!(await isRestorable(ctx, organization.deletionRequestedAt, organization.purgeJobId, now)))
			throw new ConvexError("This organization can no longer be restored.");
		const owned = await ctx.db
			.query("organizations")
			.withIndex("by_ownerId", (q) => q.eq("ownerId", userId))
			.take(MAX_OWNED_ORGANIZATIONS * 5);
		const liveOwned = owned.filter((other) => other.deletionRequestedAt === undefined).length;
		if (liveOwned >= MAX_OWNED_ORGANIZATIONS)
			throw new ConvexError(
				`You can own up to ${MAX_OWNED_ORGANIZATIONS} workspaces. Transfer ownership of one before restoring this organization.`,
			);

		await cancelPurgeJob(ctx, organization.purgeJobId);
		await ctx.db.patch("organizations", organizationId, {
			deletionRequestedAt: undefined,
			purgeJobId: undefined,
		});
		// Projects hidden with the organization (marked with its exact
		// requestedAt) come back; projects deleted on their own before keep
		// their own restore window and purge.
		const requestedAt = organization.deletionRequestedAt;
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_organizationId_deletionRequestedAt", (q) =>
				q.eq("organizationId", organizationId).eq("deletionRequestedAt", requestedAt),
			)
			.take(MARK_LIMIT);
		for (const project of projects)
			if (project.deletion?.withOrganization) await unmarkProject(ctx, project, now);
		await logAudit(ctx, {
			organizationId,
			actorId: userId,
			action: "organization.restored",
			summary: `Restored organization ${organization.name}`,
		});
		return null;
	},
});

/**
 * Organizations the signed-in user owns that are waiting out the restore
 * window. Queries never read the clock: the client hides rows past `purgeAt`.
 */
export const deleted = query({
	args: {},
	returns: v.array(
		v.object({
			id: v.id("organizations"),
			name: v.string(),
			deletedAt: v.number(),
			purgeAt: v.number(),
		}),
	),
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const owned = await ctx.db
			.query("organizations")
			.withIndex("by_ownerId", (q) => q.eq("ownerId", userId))
			.take(MAX_OWNED_ORGANIZATIONS * 5);
		return owned
			.filter((organization) => organization.deletionRequestedAt !== undefined)
			.map((organization) => ({
				id: organization._id,
				name: organization.name,
				deletedAt: organization.deletionRequestedAt!,
				purgeAt: organization.deletionRequestedAt! + RESTORE_WINDOW_MS,
			}));
	},
});

/**
 * Self-scheduling purge of one marked organization. `requestedAt` ties the
 * job to one deletion request, so a job left over from before a restore
 * never purges a later request early. Jobs from before the restore window
 * existed carry no `requestedAt`.
 */
export const purge = internalMutation({
	args: { organizationId: v.id("organizations"), requestedAt: v.optional(v.number()) },
	returns: v.null(),
	handler: async (ctx, { organizationId, requestedAt }) => {
		const organization = await ctx.db.get("organizations", organizationId);
		if (!organization || organization.deletionRequestedAt === undefined) return null;
		if (requestedAt !== undefined && organization.deletionRequestedAt !== requestedAt) return null;
		const reschedule = () =>
			ctx.scheduler.runAfter(0, internal.organizations.deletion.purge, {
				organizationId,
				requestedAt: organization.deletionRequestedAt,
			});

		const [project] = await ctx.db
			.query("projects")
			.withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
			.take(1);
		if (project) {
			await markProjectDeleting(ctx, project, Date.now(), true);
			await purgeProjectStep(ctx, project._id);
			await reschedule();
			return null;
		}

		// No feedback is left, so members have nothing to release.
		const members = await ctx.db
			.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) => q.eq("organizationId", organizationId))
			.take(MEMBER_BATCH);
		for (const member of members) await ctx.db.delete("organizationMembers", member._id);
		if (members.length === MEMBER_BATCH) {
			await reschedule();
			return null;
		}

		const audit = await ctx.db
			.query("auditLogs")
			.withIndex("by_organizationId_at", (q) => q.eq("organizationId", organizationId))
			.take(AUDIT_BATCH);
		for (const entry of audit) await ctx.db.delete("auditLogs", entry._id);
		if (audit.length === AUDIT_BATCH) {
			await reschedule();
			return null;
		}

		const taxonomies = await ctx.db
			.query("taxonomies")
			.withIndex("by_organizationId_key", (q) => q.eq("organizationId", organizationId))
			.take(50);
		for (const taxonomy of taxonomies) await ctx.db.delete("taxonomies", taxonomy._id);

		await retireSlug(ctx, "organization", organization.slug);
		await ctx.db.delete("organizations", organizationId);
		return null;
	},
});
