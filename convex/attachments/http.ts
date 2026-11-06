import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction } from "../_generated/server";
import { siteUrl } from "../email/config";
import { hmacSha256Hex, safeEqual } from "../integrations/signature";
import { downloadSignatureMessage } from "./files";
import { isAllowedType, isImageType, matchesSignature, MAX_ATTACHMENT_BYTES } from "./model";

const notFound = () =>
	new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * GET /attachments/file?id=&exp=&sig= — serves one attachment for a link
 * minted by `issueUrls` (HMAC over id + expiry, valid URL_TTL). Every
 * failure is a plain 404 so links reveal nothing about other files.
 *
 * Headers keep user content inert even when opened directly: nosniff, a
 * sandboxed CSP with no sources, and PDFs always as downloads. Images are
 * served inline so the app can show them in <img>.
 */
export const serveFile = httpAction(async (ctx, request) => {
	const params = new URL(request.url).searchParams;
	const id = params.get("id") ?? "";
	const exp = Number(params.get("exp"));
	const sig = params.get("sig") ?? "";
	if (!id || id.length > 64 || !/^[0-9a-f]{64}$/.test(sig) || !Number.isFinite(exp) || exp < Date.now())
		return notFound();
	const attachmentId = id as Id<"feedbackAttachments">;
	let file;
	try {
		file = await ctx.runQuery(internal.attachments.files.forDownload, { attachmentId });
	} catch {
		// Malformed ids fail argument validation.
		return notFound();
	}
	if (!file) return notFound();
	const expected = await hmacSha256Hex(file.signingKey, downloadSignatureMessage(id, exp));
	if (!safeEqual(expected, sig)) return notFound();
	const blob = await ctx.storage.get(file.storageId);
	if (!blob) return notFound();
	const disposition = isImageType(file.contentType) ? "inline" : "attachment";
	return new Response(blob, {
		status: 200,
		headers: {
			"Content-Type": file.contentType,
			"Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "default-src 'none'; sandbox",
			"Referrer-Policy": "no-referrer",
			"Cross-Origin-Resource-Policy": "cross-origin",
			"Cache-Control": "private, max-age=600",
		},
	});
});

const UPLOAD_HEADERS = "Authorization, Content-Type, X-Upload-Ticket, X-File-Name";
const TOO_LARGE = "Files can be at most 10 MB.";

/** The app's origin (SITE_URL); the only browser origin allowed to upload. */
function appOrigin() {
	try {
		return new URL(siteUrl()).origin;
	} catch {
		return null;
	}
}

/**
 * CORS headers for an upload request, or null when it comes from another
 * browser origin. Requests without Origin (non-browser clients) get no CORS
 * headers; they still need a valid auth token and ticket.
 */
function uploadCors(request: Request): Record<string, string> | null {
	const origin = request.headers.get("Origin");
	if (origin === null) return { Vary: "Origin" };
	if (origin !== appOrigin()) return null;
	return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

/** OPTIONS /attachments/upload — CORS preflight for the app origin only. */
export const uploadPreflight = httpAction(async (_ctx, request) => {
	const cors = uploadCors(request);
	if (!cors || !("Access-Control-Allow-Origin" in cors)) return new Response(null, { status: 403 });
	return new Response(null, {
		status: 204,
		headers: {
			...cors,
			"Access-Control-Allow-Methods": "POST",
			"Access-Control-Allow-Headers": UPLOAD_HEADERS,
			"Access-Control-Max-Age": "600",
		},
	});
});

/** Reads at most `limit` bytes of the body; null as soon as it is longer. */
async function readLimited(request: Request, limit: number): Promise<Uint8Array | null> {
	if (!request.body) return new Uint8Array(0);
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > limit) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

function errorText(error: unknown, fallback: string) {
	return error instanceof ConvexError && typeof error.data === "string" ? error.data : fallback;
}

/**
 * POST /attachments/upload — the only way files enter storage.
 *
 * Headers: Authorization (the Convex Auth token), X-Upload-Ticket (from
 * `createUploadTicket`), Content-Type (the file's type), X-File-Name
 * (URI-encoded). Everything cheap is checked before the body is read:
 * origin, type, Content-Length (≤ 10 MB), then the ticket is consumed
 * (it must belong to the caller and be unexpired). The body is read with
 * the same limit, its leading bytes must match the type, and only then is
 * it stored and registered. Responds `{ ok, attachmentId | error }`.
 */
export const uploadFile = httpAction(async (ctx, request) => {
	const cors = uploadCors(request);
	if (!cors) return new Response(null, { status: 403 });
	const reply = (status: number, body: { ok: true; attachmentId: string } | { ok: false; error: string }) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
		});
	const fail = (status: number, error: string) => reply(status, { ok: false, error });

	const ticket = request.headers.get("X-Upload-Ticket") ?? "";
	if (!/^[0-9a-f]{64}$/.test(ticket)) return fail(401, "This upload link is not valid. Please try again.");
	const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
	if (!isAllowedType(contentType)) return fail(415, "Attach PNG, JPEG, WebP or GIF images, or PDF files.");
	const declared = request.headers.get("Content-Length");
	const length = Number(declared);
	if (declared === null || !Number.isSafeInteger(length) || length < 0)
		return fail(411, "The upload has no size. Please try again.");
	if (length > MAX_ATTACHMENT_BYTES) return fail(413, TOO_LARGE);
	if (length === 0) return fail(400, "That file is empty.");
	let fileName = "attachment";
	try {
		fileName = decodeURIComponent(request.headers.get("X-File-Name") ?? "") || fileName;
	} catch {
		// Malformed encoding: keep the fallback name.
	}
	if (fileName.length > 1000) return fail(400, "That file name is too long.");

	let claim;
	try {
		claim = await ctx.runMutation(internal.attachments.files.claimUploadTicket, { ticket });
	} catch (error) {
		return fail(429, errorText(error, "Could not start the upload. Please try again."));
	}
	if (!claim) return fail(403, "This upload link has expired. Please try again.");

	const bytes = await readLimited(request, MAX_ATTACHMENT_BYTES);
	if (!bytes) return fail(413, TOO_LARGE);
	if (bytes.byteLength === 0) return fail(400, "That file is empty.");
	if (!matchesSignature(contentType, bytes.subarray(0, 16)))
		return fail(415, "The file's contents do not match its type.");

	const storageId = await ctx.storage.store(new Blob([bytes as BlobPart], { type: contentType }));
	try {
		const result = await ctx.runMutation(internal.attachments.files.completeUpload, {
			projectSlug: claim.projectSlug,
			feedbackId: claim.feedbackId,
			storageId,
			fileName,
			contentType,
		});
		return result.ok ? reply(200, result) : fail(422, result.error);
	} catch (error) {
		await ctx.storage.delete(storageId);
		return fail(403, errorText(error, "Could not attach the file. Please try again."));
	}
});
