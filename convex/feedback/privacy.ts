import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "../_generated/server";
import { logAudit } from "../audit/log";
import { enforceUserRateLimit, rateLimiter } from "../rateLimits";
import { requireCapability, requireProject } from "./access";
import { patchFeedbackRow } from "./store";

/**
 * Data-subject erasure for external submitters: removes the sender's name
 * and email from every feedback item of one project submitted with a given
 * email address. Project administrators (`project.manage`) only; archived
 * projects included, since erasure requests do not wait for a restore.
 *
 * The scan covers the whole project in bounded pages (no sender index is
 * needed for a rare operation): the first page runs inline, the rest in a
 * self-scheduling job. The job carries a SHA-256 of the address, never the
 * address itself, so the erased email does not linger in scheduled-job
 * arguments. `sender` is not part of any aggregate key, so metrics are
 * untouched; writes still go through the feedback store.
 */

/** Feedback rows scanned per transaction. */
const REDACT_BATCH = 200;

async function emailHash(email: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Scans one page and clears matching senders. */
async function redactPage(
	ctx: MutationCtx,
	projectId: Id<"projects">,
	hash: string,
	cursor: string | null,
) {
	const page = await ctx.db
		.query("feedback")
		.withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", projectId))
		.paginate({ numItems: REDACT_BATCH, cursor });
	let redacted = 0;
	for (const item of page.page) {
		const email = item.sender?.email.trim().toLowerCase();
		if (!email || (await emailHash(email)) !== hash) continue;
		await patchFeedbackRow(ctx, item._id, { sender: null });
		redacted += 1;
	}
	return { redacted, done: page.isDone, cursor: page.continueCursor };
}

export const redactSender = mutation({
	args: { projectSlug: v.string(), email: v.string() },
	returns: v.object({
		// Items cleared in this call.
		redacted: v.number(),
		// False when the rest of the project is still being processed.
		done: v.boolean(),
	}),
	handler: async (ctx, { projectSlug, email: rawEmail }) => {
		await enforceUserRateLimit(ctx, "redactSender");
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "project.manage");
		const email = rawEmail.trim().toLowerCase();
		if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
			throw new ConvexError("Enter a valid email address of 254 characters or fewer.");
		const hash = await emailHash(email);
		const first = await redactPage(ctx, project._id, hash, null);
		if (!first.done)
			await ctx.scheduler.runAfter(0, internal.feedback.privacy.redactSenderBatch, {
				projectId: project._id,
				emailHash: hash,
				cursor: first.cursor,
			});
		// Intake rate-limit state is keyed by the address; drop it too.
		await rateLimiter.reset(ctx, "intakeSender", { key: `${project._id}:${email}` });
		// The summary never names the erased address.
		await logAudit(ctx, {
			organizationId: project.organizationId,
			projectId: project._id,
			actorId: access.user._id,
			action: "project.sender_redacted",
			summary: `Erased a submitter's name and email from "${project.name}" feedback`,
		});
		return { redacted: first.redacted, done: first.done };
	},
});

/** Continuation: one page per transaction until the project is scanned. */
export const redactSenderBatch = internalMutation({
	args: {
		projectId: v.id("projects"),
		emailHash: v.string(),
		cursor: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, { projectId, emailHash: hash, cursor }) => {
		// Only a purged project ends the scan early. A project merely marked
		// for deletion can still be restored, so its remaining pages are
		// processed too and the erasure always completes.
		const project = await ctx.db.get("projects", projectId);
		if (!project) return null;
		const next = await redactPage(ctx, projectId, hash, cursor);
		if (!next.done)
			await ctx.scheduler.runAfter(0, internal.feedback.privacy.redactSenderBatch, {
				projectId,
				emailHash: hash,
				cursor: next.cursor,
			});
		return null;
	},
});
