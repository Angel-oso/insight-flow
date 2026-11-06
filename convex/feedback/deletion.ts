import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "../_generated/server";
import { enforceUserRateLimit } from "../rateLimits";
import { requireCapability, requireProject } from "./access";
import { deleteFeedbackRow } from "./store";

/**
 * Feedback deletion (spam and cleanup).
 *
 * Permission: `project.manage` (project administrators by default). Triage
 * (`feedback.triage`) is deliberately not enough: deletion is irreversible
 * and removes the team's discussion, so it stays with the people who already
 * control the project's settings. Archived projects are read-only.
 *
 * The row goes through `deleteFeedbackRow` so every aggregate stays in sync.
 * Comments and activities are removed in the same transaction up to a
 * budget; anything left (an item with a huge discussion) continues in
 * `purgeChildren`, which reschedules itself until nothing remains.
 */

/** Most items accepted by one bulk call. */
export const MAX_BULK_DELETE = 50;
/** Child rows (comments + activities) removed inline per item. */
const INLINE_CHILD_BUDGET = 40;
/** Child rows removed per continuation transaction. */
const CHILD_BATCH = 500;

/**
 * Deletes up to `budget` comments and activities of one feedback item.
 * `done` is true when none are left.
 */
export async function deleteFeedbackChildren(
	ctx: MutationCtx,
	feedbackId: Id<"feedback">,
	budget: number,
): Promise<{ deleted: number; done: boolean }> {
	const comments = await ctx.db
		.query("comments")
		.withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", feedbackId))
		.take(budget);
	for (const comment of comments) await ctx.db.delete("comments", comment._id);
	const remaining = budget - comments.length;
	if (remaining <= 0) return { deleted: comments.length, done: false };
	const activities = await ctx.db
		.query("activities")
		.withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", feedbackId))
		.take(remaining);
	for (const activity of activities) await ctx.db.delete("activities", activity._id);
	return {
		deleted: comments.length + activities.length,
		done: activities.length < remaining,
	};
}

/**
 * Deletes one feedback row (aggregates included) and its children, handing
 * leftovers to a scheduled continuation. Returns the deleted row, or null
 * when it was already gone. Callers own authorization.
 */
export async function deleteFeedbackItem(
	ctx: MutationCtx,
	feedbackId: Id<"feedback">,
	childBudget = INLINE_CHILD_BUDGET,
): Promise<Doc<"feedback"> | null> {
	const doc = await deleteFeedbackRow(ctx, feedbackId);
	if (!doc) return null;
	const { done } = await deleteFeedbackChildren(ctx, feedbackId, childBudget);
	if (!done)
		await ctx.scheduler.runAfter(0, internal.feedback.deletion.purgeChildren, { feedbackId });
	return doc;
}

async function deleteInProject(
	ctx: MutationCtx,
	projectSlug: string,
	feedbackIds: readonly Id<"feedback">[],
) {
	await enforceUserRateLimit(ctx, "deleteFeedback");
	const { project, access } = await requireProject(ctx, projectSlug);
	requireCapability(access.permissions, "project.manage");
	if (project.status === "Archived")
		throw new ConvexError("Archived projects cannot be edited.");
	const unique = [...new Set(feedbackIds)];
	if (unique.length === 0) throw new ConvexError("Choose at least one feedback item.");
	if (unique.length > MAX_BULK_DELETE)
		throw new ConvexError(`Delete at most ${MAX_BULK_DELETE} items at a time.`);
	const items = await Promise.all(unique.map((id) => ctx.db.get("feedback", id)));
	// Every id must belong to this project; ids already deleted are skipped.
	if (items.some((item) => item !== null && item.projectId !== project._id))
		throw new ConvexError("Feedback not found in this project.");
	const existing = items.filter((item): item is Doc<"feedback"> => item !== null);
	// Single deletes clean up a larger discussion inline.
	const budget = existing.length === 1 ? CHILD_BATCH : INLINE_CHILD_BUDGET;
	for (const item of existing) await deleteFeedbackItem(ctx, item._id, budget);
	if (existing.length > 0) {
		// Project-level audit entry (no feedbackId: the item is gone).
		await ctx.db.insert("activities", {
			projectId: project._id,
			actorId: access.user._id,
			type: "updated",
			message:
				existing.length === 1
					? `Deleted feedback "${existing[0].title.slice(0, 120)}"`
					: `Deleted ${existing.length} feedback items`,
			createdAt: Date.now(),
		});
	}
	return { deleted: existing.length };
}

/** Deletes one feedback item with its comments and activity. */
export const remove = mutation({
	args: { projectSlug: v.string(), feedbackId: v.id("feedback") },
	returns: v.object({ deleted: v.number() }),
	handler: (ctx, { projectSlug, feedbackId }) =>
		deleteInProject(ctx, projectSlug, [feedbackId]),
});

/** Bulk delete for spam: up to MAX_BULK_DELETE items of one project. */
export const removeMany = mutation({
	args: { projectSlug: v.string(), feedbackIds: v.array(v.id("feedback")) },
	returns: v.object({ deleted: v.number() }),
	handler: (ctx, { projectSlug, feedbackIds }) =>
		deleteInProject(ctx, projectSlug, feedbackIds),
});

/** Continuation for items whose discussion did not fit in one transaction. */
export const purgeChildren = internalMutation({
	args: { feedbackId: v.id("feedback") },
	returns: v.null(),
	handler: async (ctx, { feedbackId }) => {
		const { done } = await deleteFeedbackChildren(ctx, feedbackId, CHILD_BATCH);
		if (!done)
			await ctx.scheduler.runAfter(0, internal.feedback.deletion.purgeChildren, { feedbackId });
		return null;
	},
});
