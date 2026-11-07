import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "../_generated/server";
import { getSessionUserId, requireCapability, requireFeedback, requireProject } from "../feedback/access";
import { hmacSha256Hex, newSecret, sha256Hex } from "../integrations/signature";
import { enforceRateLimit, enforceUserRateLimit } from "../rateLimits";
import {
	cleanFileName,
	isAllowedType,
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS_PER_ITEM,
} from "./model";

/**
 * Feedback attachments (team only — public intake never accepts files).
 *
 * Upload: `createUploadTicket` (feedback.update) issues a single-use ticket
 * bound to the caller and the item → the browser POSTs the file with the
 * ticket and its auth token to our own route (convex/attachments/http.ts
 * `uploadFile`), which rejects oversized bodies by Content-Length and while
 * reading, checks the leading bytes, and only then stores the file and calls
 * `completeUpload`. We never hand out raw Convex upload URLs, so a file over
 * the size limit is never stored. `verify.ts` re-checks the stored bytes;
 * until it passes the attachment has no download link.
 *
 * Download: `getUrl` from storage returns permanent capability URLs, so we
 * never hand those out. `issueUrls` (feedback.view) signs links to our own
 * HTTP route (convex/attachments/http.ts) that expire after URL_TTL and are
 * served with safe headers (PDFs always as downloads, nosniff, sandbox CSP).
 */

/** Lifetime of a signed download link. The client refreshes before this. */
export const URL_TTL = 15 * 60_000;

type Writer = { project: Doc<"projects">; access: { user: Doc<"users">; permissions: Parameters<typeof requireCapability>[0] } };

function requireWriter({ project, access }: Writer) {
	requireCapability(access.permissions, "feedback.update");
	if (project.status === "Archived") throw new ConvexError("Archived projects cannot be edited.");
}

async function attachmentsOf(ctx: QueryCtx, feedbackId: Id<"feedback">) {
	return ctx.db
		.query("feedbackAttachments")
		.withIndex("by_feedbackId", (q) => q.eq("feedbackId", feedbackId))
		.take(MAX_ATTACHMENTS_PER_ITEM + 1);
}

/** Deletes a storage file unless an attachment row still references it. */
async function deleteIfUnreferenced(ctx: MutationCtx, storageId: Id<"_storage">) {
	const row = await ctx.db
		.query("feedbackAttachments")
		.withIndex("by_storageId", (q) => q.eq("storageId", storageId))
		.first();
	if (row) return;
	if (await ctx.db.system.get("_storage", storageId)) await ctx.storage.delete(storageId);
}

/**
 * Removes every attachment row and file of one feedback item. Called by
 * convex/feedback/store.ts `deleteFeedbackRow`, so single, bulk, project and
 * organization deletion all clean up files. At most MAX_ATTACHMENTS_PER_ITEM
 * rows exist per item, so this stays small.
 */
export async function deleteFeedbackAttachments(ctx: MutationCtx, feedbackId: Id<"feedback">) {
	const rows = await ctx.db
		.query("feedbackAttachments")
		.withIndex("by_feedbackId", (q) => q.eq("feedbackId", feedbackId))
		.take(50);
	for (const row of rows) {
		await ctx.db.delete("feedbackAttachments", row._id);
		if (await ctx.db.system.get("_storage", row.storageId)) await ctx.storage.delete(row.storageId);
	}
}

export const list = query({
	args: { projectSlug: v.string(), feedbackId: v.id("feedback") },
	returns: v.object({
		canManage: v.boolean(),
		attachments: v.array(
			v.object({
				_id: v.id("feedbackAttachments"),
				fileName: v.string(),
				contentType: v.string(),
				size: v.number(),
				createdAt: v.number(),
				verified: v.boolean(),
				uploadedBy: v.string(),
			}),
		),
	}),
	handler: async (ctx, { projectSlug, feedbackId }) => {
		const { project, access } = await requireFeedback(ctx, projectSlug, feedbackId);
		const rows = await attachmentsOf(ctx, feedbackId);
		const attachments = await Promise.all(
			rows.map(async (row) => {
				const user = await ctx.db.get("users", row.uploadedBy);
				return {
					_id: row._id,
					fileName: row.fileName,
					contentType: row.contentType,
					size: row.size,
					createdAt: row.createdAt,
					verified: row.verified,
					uploadedBy: user?.name ?? "Former member",
				};
			}),
		);
		return {
			canManage: access.permissions.includes("feedback.update") && project.status !== "Archived",
			attachments,
		};
	},
});

/** How long an upload ticket stays usable (checked before the body is read). */
export const UPLOAD_TICKET_TTL = 10 * 60_000;

/**
 * Issues one upload ticket: a random secret (only its hash is stored) bound
 * to the caller and the item, valid UPLOAD_TICKET_TTL and for one upload.
 * Rate-limited, so the upload route is too (one ticket per upload).
 */
export const createUploadTicket = mutation({
	args: { projectSlug: v.string(), feedbackId: v.id("feedback") },
	returns: v.object({ uploadUrl: v.string(), ticket: v.string(), expiresAt: v.number() }),
	handler: async (ctx, { projectSlug, feedbackId }) => {
		await enforceUserRateLimit(ctx, "attachmentChange");
		const access = await requireFeedback(ctx, projectSlug, feedbackId);
		requireWriter(access);
		if ((await attachmentsOf(ctx, feedbackId)).length >= MAX_ATTACHMENTS_PER_ITEM)
			throw new ConvexError(`An item can have at most ${MAX_ATTACHMENTS_PER_ITEM} attachments.`);
		const site = process.env.CONVEX_SITE_URL;
		if (!site) throw new ConvexError("File uploads are not configured.");
		const ticket = newSecret("");
		const expiresAt = Date.now() + UPLOAD_TICKET_TTL;
		await ctx.db.insert("attachmentUploadTickets", {
			tokenHash: await sha256Hex(ticket),
			userId: access.access.user._id,
			projectId: access.project._id,
			feedbackId,
			expiresAt,
		});
		return { uploadUrl: `${site}/attachments/upload`, ticket, expiresAt };
	},
});

/**
 * Called by the upload route before it reads the body. Consumes the ticket
 * (single use) when it exists, is unexpired and belongs to the caller (the
 * route's Authorization token); otherwise returns null. A ticket presented
 * by someone else is left alone, so a leaked ticket cannot be burned.
 */
export const claimUploadTicket = internalMutation({
	args: { ticket: v.string() },
	returns: v.union(v.null(), v.object({ projectSlug: v.string(), feedbackId: v.id("feedback") })),
	handler: async (ctx, { ticket }) => {
		const userId = await getSessionUserId(ctx);
		if (!userId) return null;
		const tokenHash = await sha256Hex(ticket);
		const row = await ctx.db
			.query("attachmentUploadTickets")
			.withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
			.unique();
		if (!row || row.userId !== userId) return null;
		await ctx.db.delete("attachmentUploadTickets", row._id);
		if (row.expiresAt < Date.now()) return null;
		await enforceRateLimit(ctx, "attachmentUpload", userId);
		const project = await ctx.db.get("projects", row.projectId);
		if (!project) return null;
		return { projectSlug: project.slug, feedbackId: row.feedbackId };
	},
});

/**
 * Links a file the upload route just stored to the item. Authorization is
 * re-checked (access may have changed since the ticket was issued) and
 * failures throw; the route then deletes the file. A file that breaks the
 * rules is deleted here and reported as `{ ok: false }`.
 */
export const completeUpload = internalMutation({
	args: {
		projectSlug: v.string(),
		feedbackId: v.id("feedback"),
		storageId: v.id("_storage"),
		fileName: v.string(),
		// Checked by the route against the leading bytes before storing.
		contentType: v.string(),
	},
	returns: v.union(
		v.object({ ok: v.literal(true), attachmentId: v.id("feedbackAttachments") }),
		v.object({ ok: v.literal(false), error: v.string() }),
	),
	handler: async (ctx, { projectSlug, feedbackId, storageId, fileName, contentType }) => {
		const access = await requireFeedback(ctx, projectSlug, feedbackId);
		requireWriter(access);
		const file = await ctx.db.system.get("_storage", storageId);
		if (!file) throw new ConvexError("The upload was not found. Please try again.");

		const reject = async (error: string) => {
			await deleteIfUnreferenced(ctx, storageId);
			return { ok: false as const, error };
		};
		if (fileName.length > 1000) return await reject("That file name is too long.");
		if (!isAllowedType(contentType))
			return await reject("Attach PNG, JPEG, WebP or GIF images, or PDF files.");
		if (file.size <= 0) return await reject("That file is empty.");
		if (file.size > MAX_ATTACHMENT_BYTES) return await reject("Files can be at most 10 MB.");
		if ((await attachmentsOf(ctx, feedbackId)).length >= MAX_ATTACHMENTS_PER_ITEM)
			return await reject(`An item can have at most ${MAX_ATTACHMENTS_PER_ITEM} attachments.`);

		const now = Date.now();
		const name = cleanFileName(fileName);
		const attachmentId = await ctx.db.insert("feedbackAttachments", {
			projectId: access.project._id,
			feedbackId,
			storageId,
			fileName: name,
			contentType,
			size: file.size,
			uploadedBy: access.access.user._id,
			createdAt: now,
			verified: false,
		});
		await ctx.db.insert("activities", {
			projectId: access.project._id,
			feedbackId,
			actorId: access.access.user._id,
			type: "updated",
			message: `Attached ${name}`,
			createdAt: now,
		});
		await ctx.scheduler.runAfter(0, internal.attachments.verify.run, { attachmentId });
		return { ok: true as const, attachmentId };
	},
});

export const remove = mutation({
	args: { projectSlug: v.string(), attachmentId: v.id("feedbackAttachments") },
	returns: v.null(),
	handler: async (ctx, { projectSlug, attachmentId }) => {
		await enforceUserRateLimit(ctx, "attachmentChange");
		const access = await requireProject(ctx, projectSlug);
		const row = await ctx.db.get("feedbackAttachments", attachmentId);
		if (!row || row.projectId !== access.project._id)
			throw new ConvexError("Attachment not found.");
		requireWriter(access);
		await ctx.db.delete("feedbackAttachments", row._id);
		if (await ctx.db.system.get("_storage", row.storageId)) await ctx.storage.delete(row.storageId);
		await ctx.db.insert("activities", {
			projectId: row.projectId,
			feedbackId: row.feedbackId,
			actorId: access.access.user._id,
			type: "updated",
			message: `Removed attachment ${row.fileName}`,
			createdAt: Date.now(),
		});
		return null;
	},
});

/** The signing key, created on first use. */
async function signingKey(ctx: MutationCtx) {
	const state = await ctx.db.query("attachmentState").first();
	if (state) return state.signingKey;
	const key = newSecret("");
	await ctx.db.insert("attachmentState", { signingKey: key, sweptUntil: 0 });
	return key;
}

export function downloadSignatureMessage(attachmentId: string, expiresAt: number) {
	return `${attachmentId}.${expiresAt}`;
}

/**
 * Short-lived download links for the item's verified attachments. A
 * mutation (not a query) so links are minted with the real clock and never
 * cached; only members with feedback.view get here (requireFeedback).
 */
export const issueUrls = mutation({
	args: { projectSlug: v.string(), feedbackId: v.id("feedback") },
	returns: v.object({
		expiresAt: v.number(),
		urls: v.array(v.object({ attachmentId: v.id("feedbackAttachments"), url: v.string() })),
	}),
	handler: async (ctx, { projectSlug, feedbackId }) => {
		await requireFeedback(ctx, projectSlug, feedbackId);
		const site = process.env.CONVEX_SITE_URL;
		if (!site) throw new ConvexError("File downloads are not configured.");
		const rows = (await attachmentsOf(ctx, feedbackId)).filter((row) => row.verified);
		const expiresAt = Date.now() + URL_TTL;
		const key = rows.length > 0 ? await signingKey(ctx) : "";
		const urls = await Promise.all(
			rows.map(async (row) => {
				const sig = await hmacSha256Hex(key, downloadSignatureMessage(row._id, expiresAt));
				const params = new URLSearchParams({ id: row._id, exp: String(expiresAt), sig });
				return { attachmentId: row._id, url: `${site}/attachments/file?${params}` };
			}),
		);
		return { expiresAt, urls };
	},
});

/** Everything the download route needs; null when the file is gone. */
export const forDownload = internalQuery({
	args: { attachmentId: v.id("feedbackAttachments") },
	returns: v.union(
		v.null(),
		v.object({
			signingKey: v.string(),
			storageId: v.id("_storage"),
			contentType: v.string(),
			fileName: v.string(),
		}),
	),
	handler: async (ctx, { attachmentId }) => {
		const [row, state] = await Promise.all([
			ctx.db.get("feedbackAttachments", attachmentId),
			ctx.db.query("attachmentState").first(),
		]);
		if (!row || !row.verified || !state) return null;
		// Projects being deleted serve nothing, even with a valid link.
		const project = await ctx.db.get("projects", row.projectId);
		if (!project || project.deletionRequestedAt !== undefined) return null;
		return {
			signingKey: state.signingKey,
			storageId: row.storageId,
			contentType: row.contentType,
			fileName: row.fileName,
		};
	},
});

export const forVerification = internalQuery({
	args: { attachmentId: v.id("feedbackAttachments") },
	returns: v.union(v.null(), v.object({ storageId: v.id("_storage"), contentType: v.string(), size: v.number() })),
	handler: async (ctx, { attachmentId }) => {
		const row = await ctx.db.get("feedbackAttachments", attachmentId);
		if (!row || row.verified) return null;
		return { storageId: row.storageId, contentType: row.contentType, size: row.size };
	},
});

/** Marks a checked attachment, or deletes it (row + file) when it failed. */
export const finishVerification = internalMutation({
	args: { attachmentId: v.id("feedbackAttachments"), ok: v.boolean() },
	returns: v.null(),
	handler: async (ctx, { attachmentId, ok }) => {
		const row = await ctx.db.get("feedbackAttachments", attachmentId);
		if (!row) return null;
		if (ok) {
			await ctx.db.patch("feedbackAttachments", attachmentId, { verified: true });
			return null;
		}
		await ctx.db.delete("feedbackAttachments", attachmentId);
		if (await ctx.db.system.get("_storage", row.storageId)) await ctx.storage.delete(row.storageId);
		await ctx.db.insert("activities", {
			projectId: row.projectId,
			feedbackId: row.feedbackId,
			actorId: null,
			type: "updated",
			message: `Removed ${row.fileName}: its contents did not match its file type`,
			createdAt: Date.now(),
		});
		return null;
	},
});
