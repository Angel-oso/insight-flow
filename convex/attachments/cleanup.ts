import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { newSecret } from "../integrations/signature";

/**
 * Orphaned uploads: the upload route stores a file and then registers it in
 * a separate mutation, and deletes the file when that fails. If the action
 * dies in between (crash, timeout) the file has no row, so we sweep:
 *
 * An hourly cron walks `_storage` in creation order from a watermark
 * (`attachmentState.sweptUntil`) up to ORPHAN_AGE ago and deletes every file
 * no `feedbackAttachments` row references. ORPHAN_AGE is far past the time
 * between storing and registering, so an in-flight upload is never touched.
 * The watermark makes each run read only new files (no full scans), and a
 * missed run is simply caught up by the next one.
 *
 * Attachments are currently the ONLY owner of files in Convex storage. A
 * future feature that stores files must be added to `isReferenced` below,
 * or the sweep will delete its files.
 */
export const ORPHAN_AGE = 2 * 60 * 60_000;
const BATCH = 200;

export const sweepOrphans = internalMutation({
	args: {},
	returns: v.object({ checked: v.number(), deleted: v.number() }),
	handler: async (ctx) => {
		let state = await ctx.db.query("attachmentState").first();
		if (!state) {
			const id = await ctx.db.insert("attachmentState", { signingKey: newSecret(""), sweptUntil: 0 });
			state = (await ctx.db.get("attachmentState", id))!;
		}
		const cutoff = Date.now() - ORPHAN_AGE;
		const files = await ctx.db.system
			.query("_storage")
			.withIndex("by_creation_time", (q) =>
				q.gt("_creationTime", state.sweptUntil).lte("_creationTime", cutoff),
			)
			.take(BATCH);
		let deleted = 0;
		for (const file of files) {
			const isReferenced = await ctx.db
				.query("feedbackAttachments")
				.withIndex("by_storageId", (q) => q.eq("storageId", file._id))
				.first();
			if (isReferenced) continue;
			await ctx.storage.delete(file._id);
			deleted++;
		}
		if (files.length > 0)
			await ctx.db.patch("attachmentState", state._id, {
				sweptUntil: files[files.length - 1]._creationTime,
			});
		// Expired upload tickets are useless; drop them in bounded batches.
		const tickets = await ctx.db
			.query("attachmentUploadTickets")
			.withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
			.take(BATCH);
		for (const ticket of tickets) await ctx.db.delete("attachmentUploadTickets", ticket._id);
		if (files.length === BATCH || tickets.length === BATCH)
			await ctx.scheduler.runAfter(0, internal.attachments.cleanup.sweepOrphans, {});
		return { checked: files.length, deleted };
	},
});
