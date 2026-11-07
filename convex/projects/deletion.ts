import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { logAudit } from "../audit/log";
import { deleteFeedbackChildren } from "../feedback/deletion";
import { deleteFeedbackRow } from "../feedback/store";
import { deleteProjectWebhooks } from "../integrations/webhooks";
import { retireSlug } from "../lib/slugs";
import { requireOrganization } from "../organizations/access";
import { enforceUserRateLimit } from "../rateLimits";
import { MAX_PROJECTS_PER_ORGANIZATION } from "./mutations";

/**
 * Project deletion, with a 7-day restore window.
 *
 * Permission: organization administrators of the project's organization
 * (`requireOrganization(…, true)`), with the project name typed as
 * confirmation. Project-level admins who are not organization admins
 * cannot delete or restore: a project is organization property.
 *
 * 1. `remove` marks the project (`deletionRequestedAt`, status Archived,
 *    inbox/alerts/digest off, previous values kept in `deletion`). Every
 *    lookup ignores marked projects (requireProject, resolveProjectAccess,
 *    public intake, overviews, digests, alerts, invitation accept/preview),
 *    so it disappears at once. The purge runs RESTORE_WINDOW_MS later.
 * 2. `restore` (organization admins, within the window) clears the mark,
 *    puts the previous settings back and cancels the scheduled purge.
 * 3. `purge` re-checks that the project still carries the very request it
 *    was scheduled for (so a restore followed by a new deletion can never be
 *    purged early by the old job), then runs bounded steps
 *    (`purgeProjectStep`) that delete feedback (through the store, so
 *    aggregates drop with it) and comments, then activities, invitations,
 *    project members and custom roles, and finally the project document.
 *    The slug is retired only then, so a restored project keeps its slug.
 */

export const RESTORE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Documents deleted per purge transaction (aggregate writes come on top). */
const STEP_BUDGET = 400;
/** Feedback rows per purge transaction (each touches six aggregates). */
const FEEDBACK_PER_STEP = 50;

/**
 * Hides a project from every lookup, remembering what it switches off.
 * `withOrganization` marks projects hidden by an organization deletion.
 * Returns false if already marked.
 */
export async function markProjectDeleting(
	ctx: MutationCtx,
	project: Doc<"projects">,
	now: number,
	withOrganization = false,
) {
	if (project.deletionRequestedAt !== undefined) return false;
	await ctx.db.patch("projects", project._id, {
		status: "Archived",
		inboxEnabled: false,
		criticalAlerts: false,
		weeklyDigest: false,
		deletionRequestedAt: now,
		deletion: {
			status: project.status,
			inboxEnabled: project.inboxEnabled,
			criticalAlerts: project.criticalAlerts,
			weeklyDigest: project.weeklyDigest,
			...(withOrganization ? { withOrganization: true } : {}),
		},
		updatedAt: now,
	});
	return true;
}

/**
 * True while a deletion can still be undone: inside the window and, when
 * the purge job is known, before it started.
 */
export async function isRestorable(
	ctx: QueryCtx | MutationCtx,
	requestedAt: number,
	purgeJobId: Id<"_scheduled_functions"> | undefined,
	now: number,
) {
	if (now >= requestedAt + RESTORE_WINDOW_MS) return false;
	if (purgeJobId === undefined) return true;
	const job = await ctx.db.system.get("_scheduled_functions", purgeJobId);
	return job !== null && job.state.kind === "pending";
}

/** Cancels a still-pending purge job (completed jobs cannot be cancelled). */
export async function cancelPurgeJob(ctx: MutationCtx, jobId: Id<"_scheduled_functions"> | undefined) {
	if (jobId === undefined) return;
	const job = await ctx.db.system.get("_scheduled_functions", jobId);
	if (job?.state.kind === "pending") await ctx.scheduler.cancel(jobId);
}

/**
 * Clears a project's deletion mark and puts back the settings deletion
 * switched off. Callers check permissions, limits and the window.
 */
export async function unmarkProject(ctx: MutationCtx, project: Doc<"projects">, now: number) {
	const previous = project.deletion;
	await ctx.db.patch("projects", project._id, {
		deletionRequestedAt: undefined,
		deletion: undefined,
		updatedAt: now,
		// Projects marked before snapshots existed stay archived (read-only).
		...(previous
			? {
					status: previous.status,
					inboxEnabled: previous.inboxEnabled,
					criticalAlerts: previous.criticalAlerts,
					weeklyDigest: previous.weeklyDigest,
				}
			: {}),
	});
}

/**
 * One bounded purge step. Returns true once the project document itself is
 * gone; false means more work remains (schedule another step).
 */
export async function purgeProjectStep(ctx: MutationCtx, projectId: Id<"projects">): Promise<boolean> {
	const project = await ctx.db.get("projects", projectId);
	if (!project) return true;
	// Never purge a live project, whatever scheduled this.
	if (project.deletionRequestedAt === undefined) return true;
	let budget = STEP_BUDGET;

	// 1. Feedback: each row's comments (and feedback activities) first, so a
	//    huge discussion is never orphaned, then the row via the store.
	const items = await ctx.db
		.query("feedback")
		.withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", projectId))
		.take(FEEDBACK_PER_STEP);
	for (const item of items) {
		const children = await deleteFeedbackChildren(ctx, item._id, budget);
		budget -= children.deleted;
		if (!children.done) return false;
		await deleteFeedbackRow(ctx, item._id);
		budget -= 1;
		if (budget <= 0) return false;
	}
	if (items.length > 0) return false;

	// 2. Project-level rows, one table at a time. A full batch means the
	//    table may have more rows: stop and continue in the next step.
	const activities = await ctx.db.query("activities")
		.withIndex("by_projectId_createdAt", (q) => q.eq("projectId", projectId)).take(budget);
	for (const row of activities) await ctx.db.delete("activities", row._id);
	if (activities.length === budget) return false;
	budget -= activities.length;

	const invitations = await ctx.db.query("projectInvitations")
		.withIndex("by_projectId", (q) => q.eq("projectId", projectId)).take(budget);
	for (const row of invitations) await ctx.db.delete("projectInvitations", row._id);
	if (invitations.length === budget) return false;
	budget -= invitations.length;

	const members = await ctx.db.query("projectMembers")
		.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId)).take(budget);
	for (const row of members) await ctx.db.delete("projectMembers", row._id);
	if (members.length === budget) return false;
	budget -= members.length;

	// Custom roles live only in this project (built-in roles have no projectId).
	const roles = await ctx.db.query("roles")
		.withIndex("by_projectId", (q) => q.eq("projectId", projectId)).take(budget);
	for (const row of roles) await ctx.db.delete("roles", row._id);
	if (roles.length === budget) return false;
	budget -= roles.length;

	// Notification state: per-member preferences (with unsubscribe tokens)
	// and the critical-alert ledger.
	const preferences = await ctx.db.query("notificationPreferences")
		.withIndex("by_projectId", (q) => q.eq("projectId", projectId)).take(budget);
	for (const row of preferences) await ctx.db.delete("notificationPreferences", row._id);
	if (preferences.length === budget) return false;
	budget -= preferences.length;

	const alerts = await ctx.db.query("criticalAlertLog")
		.withIndex("by_projectId_state_at", (q) => q.eq("projectId", projectId)).take(budget);
	for (const row of alerts) await ctx.db.delete("criticalAlertLog", row._id);
	if (alerts.length === budget) return false;

	// Webhooks (at most 3) hold signing secrets; drop them with the project.
	await deleteProjectWebhooks(ctx, projectId);
	await retireSlug(ctx, "project", project.slug);
	await ctx.db.delete("projects", projectId);
	return true;
}

export const remove = mutation({
	args: { projectSlug: v.string(), confirmName: v.string() },
	returns: v.null(),
	handler: async (ctx, { projectSlug, confirmName }) => {
		await enforceUserRateLimit(ctx, "deleteWorkspaceData");
		const project = await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", projectSlug))
			.unique();
		if (!project || project.deletionRequestedAt !== undefined)
			throw new ConvexError("Project not found.");
		const { userId } = await requireOrganization(ctx, project.organizationId, true);
		if (confirmName.trim() !== project.name)
			throw new ConvexError("Type the project name exactly to confirm.");
		const now = Date.now();
		await markProjectDeleting(ctx, project, now);
		const purgeJobId = await ctx.scheduler.runAfter(RESTORE_WINDOW_MS, internal.projects.deletion.purge, {
			projectId: project._id,
			requestedAt: now,
		});
		const marked = (await ctx.db.get("projects", project._id))!;
		await ctx.db.patch("projects", project._id, { deletion: { ...marked.deletion!, purgeJobId } });
		await logAudit(ctx, {
			organizationId: project.organizationId,
			projectId: project._id,
			actorId: userId,
			action: "project.deletion_requested",
			summary: `Deleted project ${project.name} (restorable for 7 days)`,
		});
		return null;
	},
});

/** Organization administrators bring a deleted project back within the window. */
export const restore = mutation({
	args: { projectId: v.id("projects") },
	returns: v.object({ slug: v.string() }),
	handler: async (ctx, { projectId }) => {
		await enforceUserRateLimit(ctx, "restoreWorkspaceData");
		const project = await ctx.db.get("projects", projectId);
		if (!project) throw new ConvexError("Project not found.");
		// Throws for deleted organizations too: restore the organization first.
		const { userId } = await requireOrganization(ctx, project.organizationId, true);
		if (project.deletionRequestedAt === undefined || project.deletion?.withOrganization)
			throw new ConvexError("Project not found.");
		const now = Date.now();
		if (!(await isRestorable(ctx, project.deletionRequestedAt, project.deletion?.purgeJobId, now)))
			throw new ConvexError("This project can no longer be restored.");
		const live = await ctx.db
			.query("projects")
			.withIndex("by_organizationId_deletionRequestedAt", (q) =>
				q.eq("organizationId", project.organizationId).eq("deletionRequestedAt", undefined),
			)
			.take(MAX_PROJECTS_PER_ORGANIZATION);
		if (live.length >= MAX_PROJECTS_PER_ORGANIZATION)
			throw new ConvexError(
				`A workspace can have up to ${MAX_PROJECTS_PER_ORGANIZATION} projects. Delete one before restoring this project.`,
			);
		if (live.some((other) => other.name.toLowerCase() === project.name.toLowerCase()))
			throw new ConvexError(
				`This workspace already has a project named ${project.name}. Rename it before restoring this one.`,
			);
		await cancelPurgeJob(ctx, project.deletion?.purgeJobId);
		await unmarkProject(ctx, project, now);
		await logAudit(ctx, {
			organizationId: project.organizationId,
			projectId,
			actorId: userId,
			action: "project.restored",
			summary: `Restored project ${project.name}`,
		});
		return { slug: project.slug };
	},
});

/**
 * Projects of an organization deleted on their own (not with the whole
 * organization), for its administrators. `purgeAt` is when the data goes;
 * queries never read the clock, so the client hides rows past it.
 */
export const deleted = query({
	args: { organizationId: v.id("organizations") },
	returns: v.array(
		v.object({
			id: v.id("projects"),
			name: v.string(),
			deletedAt: v.number(),
			purgeAt: v.number(),
		}),
	),
	handler: async (ctx, { organizationId }) => {
		await requireOrganization(ctx, organizationId, true);
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_organizationId_deletionRequestedAt", (q) =>
				q.eq("organizationId", organizationId).gt("deletionRequestedAt", 0),
			)
			.order("desc")
			.take(MAX_PROJECTS_PER_ORGANIZATION);
		return projects
			.filter((project) => !project.deletion?.withOrganization)
			.map((project) => ({
				id: project._id,
				name: project.name,
				deletedAt: project.deletionRequestedAt!,
				purgeAt: project.deletionRequestedAt! + RESTORE_WINDOW_MS,
			}));
	},
});

/**
 * Self-scheduling purge of one marked project. `requestedAt` ties the job to
 * one deletion request: after a restore (and maybe a new deletion) the
 * project's mark no longer matches and the job does nothing. Jobs scheduled
 * before the restore window existed carry no `requestedAt`.
 */
export const purge = internalMutation({
	args: { projectId: v.id("projects"), requestedAt: v.optional(v.number()) },
	returns: v.null(),
	handler: async (ctx, { projectId, requestedAt }) => {
		const project = await ctx.db.get("projects", projectId);
		if (!project || project.deletionRequestedAt === undefined) return null;
		if (requestedAt !== undefined && project.deletionRequestedAt !== requestedAt) return null;
		const done = await purgeProjectStep(ctx, projectId);
		if (!done)
			await ctx.scheduler.runAfter(0, internal.projects.deletion.purge, {
				projectId,
				requestedAt: project.deletionRequestedAt,
			});
		return null;
	},
});
