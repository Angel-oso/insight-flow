import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { isAllowedType, matchesSignature } from "./model";

/**
 * Checks a newly registered attachment's leading bytes against its declared
 * type (the Content-Type the uploading browser sent). A mismatch deletes the
 * attachment and its file; a match unlocks download links.
 */
export const run = internalAction({
	args: { attachmentId: v.id("feedbackAttachments") },
	returns: v.null(),
	handler: async (ctx, { attachmentId }) => {
		const row = await ctx.runQuery(internal.attachments.files.forVerification, { attachmentId });
		if (!row) return null;
		const blob = await ctx.storage.get(row.storageId);
		let ok = false;
		if (blob && isAllowedType(row.contentType) && blob.size === row.size) {
			const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
			ok = matchesSignature(row.contentType, head);
		}
		await ctx.runMutation(internal.attachments.files.finishVerification, { attachmentId, ok });
		return null;
	},
});
