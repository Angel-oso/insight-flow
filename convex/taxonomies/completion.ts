import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { patchFeedbackRow } from "../feedback/store";
import { getFinalStatuses } from "./lib";

/** Feedback rows per transaction (each patch touches two aggregates). */
const SYNC_BATCH = 100;
/** Projects of one organization queued per page (more pages follow). */
const PROJECT_PAGE = 100;

/** Next page of the organization's live projects. */
async function projectPage(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	cursor: string | null,
) {
	const page = await ctx.db
		.query("projects")
		.withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
		.paginate({ numItems: PROJECT_PAGE, cursor });
	return {
		projectIds: page.page
			.filter((project) => project.deletionRequestedAt === undefined)
			.map((project) => project._id),
		projectCursor: page.isDone ? null : page.continueCursor,
	};
}

/**
 * Starts the backfill after a status option's `isFinal` flag changed: every
 * live project of the organization gets its items with that status synced.
 * Projects are queued a page at a time, so organizations of any size are
 * covered (the job fetches the next page when its queue runs out).
 */
export async function scheduleCompletedAtSync(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	status: string,
) {
	const { projectIds, projectCursor } = await projectPage(ctx, organizationId, null);
	if (projectIds.length === 0 && projectCursor === null) return;
	await ctx.scheduler.runAfter(0, internal.taxonomies.completion.syncCompletedAt, {
		organizationId,
		status,
		projectIds,
		cursor: null,
		projectCursor,
	});
}

/**
 * Brings `completedAt` in line with the status's CURRENT final flag (read
 * on every batch, so toggling twice quickly still converges): items in a
 * now-final status get `completedAt = updatedAt` (their last change, not the
 * moment of the settings edit, so completion charts do not spike), items in
 * a now-open status lose it. Writes go through the feedback store so the
 * completion aggregates stay exact. One project page per transaction,
 * self-scheduling until every queued project (and every further page of
 * projects, via `projectCursor`) is done.
 */
export const syncCompletedAt = internalMutation({
	args: {
		organizationId: v.id("organizations"),
		status: v.string(),
		projectIds: v.array(v.id("projects")),
		cursor: v.union(v.string(), v.null()),
		// Next page of the organization's projects; null/absent when none left.
		projectCursor: v.optional(v.union(v.string(), v.null())),
	},
	returns: v.null(),
	handler: async (ctx, { organizationId, status, projectIds, cursor, projectCursor = null }) => {
		const organization = await ctx.db.get("organizations", organizationId);
		if (!organization || organization.deletionRequestedAt !== undefined) return null;
		const [projectId, ...rest] = projectIds;
		if (projectId === undefined) {
			// Queue drained: load the next page of projects, if any.
			if (projectCursor === null) return null;
			const next = await projectPage(ctx, organizationId, projectCursor);
			await ctx.scheduler.runAfter(0, internal.taxonomies.completion.syncCompletedAt, {
				organizationId,
				status,
				projectIds: next.projectIds,
				cursor: null,
				projectCursor: next.projectCursor,
			});
			return null;
		}
		const project = await ctx.db.get("projects", projectId);
		let next: { projectIds: Id<"projects">[]; cursor: string | null } = { projectIds: rest, cursor: null };
		if (project && project.deletionRequestedAt === undefined && project.organizationId === organizationId) {
			const isFinal = (await getFinalStatuses(ctx, organizationId)).has(status);
			const page = await ctx.db
				.query("feedback")
				.withIndex("by_projectId_status", (q) => q.eq("projectId", projectId).eq("status", status))
				.paginate({ numItems: SYNC_BATCH, cursor });
			for (const item of page.page) {
				if (isFinal && item.completedAt === undefined)
					await patchFeedbackRow(ctx, item._id, { completedAt: item.updatedAt });
				else if (!isFinal && item.completedAt !== undefined)
					await patchFeedbackRow(ctx, item._id, { completedAt: undefined });
			}
			if (!page.isDone) next = { projectIds, cursor: page.continueCursor };
		}
		if (next.projectIds.length > 0 || projectCursor !== null)
			await ctx.scheduler.runAfter(0, internal.taxonomies.completion.syncCompletedAt, {
				organizationId,
				status,
				...next,
				projectCursor,
			});
		return null;
	},
});
