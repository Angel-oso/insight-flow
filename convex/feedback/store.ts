import type { WithoutSystemFields } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { deleteFeedbackAttachments } from "../attachments/files";
import { FEEDBACK_AGGREGATES } from "./aggregates";

/**
 * THE single write path for the `feedback` table.
 *
 * Every insert, patch and delete of a feedback row MUST go through the
 * helpers below (never `ctx.db.insert/patch/replace/delete("feedback", …)`
 * directly). They update the row and every aggregate in
 * convex/feedback/aggregates.ts in the same transaction, so project metrics
 * can never drift from the table. That includes future features such as
 * feedback, project or account deletion: use `deleteFeedbackRow` for each
 * row (in bounded batches, rescheduling the rest).
 *
 * The aggregate writes use the idempotent variants (insertIfDoesNotExist /
 * replaceOrInsert / deleteIfExists), so the live path keeps working for
 * rows written before the aggregates existed, while `backfillAggregates`
 * catches those rows up.
 */
export type FeedbackFields = WithoutSystemFields<Doc<"feedback">>;
export type FeedbackPatch = Partial<FeedbackFields>;

export async function insertFeedbackRow(
	ctx: MutationCtx,
	fields: FeedbackFields,
): Promise<Id<"feedback">> {
	const id = await ctx.db.insert("feedback", fields);
	const doc = (await ctx.db.get("feedback", id))!;
	for (const { aggregate } of FEEDBACK_AGGREGATES)
		await aggregate.insertIfDoesNotExist(ctx, doc);
	return id;
}

/**
 * Shallow-merges `patch` (a field set to `undefined` is removed, as with
 * `ctx.db.patch`). Only aggregates whose namespace or key changed are
 * touched, so metadata-only writes (e.g. `updatedAt`) stay cheap.
 * Throws when the row does not exist; returns the updated document.
 */
export async function patchFeedbackRow(
	ctx: MutationCtx,
	id: Id<"feedback">,
	patch: FeedbackPatch,
): Promise<Doc<"feedback">> {
	const before = await ctx.db.get("feedback", id);
	if (!before) throw new ConvexError("Feedback not found.");
	await ctx.db.patch("feedback", id, patch);
	const after = (await ctx.db.get("feedback", id))!;
	for (const { aggregate, entry } of FEEDBACK_AGGREGATES) {
		if (sameEntry(entry, before, after)) continue;
		await aggregate.replaceOrInsert(ctx, before, after);
	}
	return after;
}

/**
 * Deletes one row and its aggregate entries. Returns the deleted document,
 * or null when it was already gone (safe to retry). Callers own related
 * cleanup (comments, activities) and authorization.
 */
export async function deleteFeedbackRow(
	ctx: MutationCtx,
	id: Id<"feedback">,
): Promise<Doc<"feedback"> | null> {
	const doc = await ctx.db.get("feedback", id);
	if (!doc) return null;
	await ctx.db.delete("feedback", id);
	for (const { aggregate } of FEEDBACK_AGGREGATES)
		await aggregate.deleteIfExists(ctx, doc);
	// Attachment rows and their storage files (at most 5 per item).
	await deleteFeedbackAttachments(ctx, id);
	return doc;
}

function sameEntry(
	entry: (doc: Doc<"feedback">) => unknown,
	before: Doc<"feedback">,
	after: Doc<"feedback">,
) {
	// Every aggregate is namespaced by projectId; compare namespace + key.
	return (
		before.projectId === after.projectId &&
		JSON.stringify(entry(before)) === JSON.stringify(entry(after))
	);
}

const BACKFILL_BATCH = 100;

/**
 * Idempotent, resumable backfill of every feedback aggregate from existing
 * rows. Safe to run while traffic is live and to run more than once.
 *
 * Run once after deploying the aggregates to an environment with data:
 *   npx convex run feedback/store:backfillAggregates '{}'          (dev)
 *   npx convex run --prod feedback/store:backfillAggregates '{}'   (prod)
 * It processes one page per transaction and schedules itself until done;
 * watch the logs for "feedback aggregate backfill complete".
 */
export const backfillAggregates = internalMutation({
	args: { cursor: v.optional(v.union(v.string(), v.null())) },
	returns: v.null(),
	handler: async (ctx, { cursor }) => {
		const page = await ctx.db
			.query("feedback")
			.paginate({ numItems: BACKFILL_BATCH, cursor: cursor ?? null });
		for (const doc of page.page)
			for (const { aggregate } of FEEDBACK_AGGREGATES)
				await aggregate.insertIfDoesNotExist(ctx, doc);
		if (page.isDone) {
			console.log("feedback aggregate backfill complete");
			return null;
		}
		await ctx.scheduler.runAfter(0, internal.feedback.store.backfillAggregates, {
			cursor: page.continueCursor,
		});
		return null;
	},
});
