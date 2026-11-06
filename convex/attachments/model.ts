/**
 * Attachment rules shared by the upload path, the byte check and the UI.
 * Images and PDFs only: no SVG (it can carry script) and no HTML-ish types.
 */
export const ALLOWED_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"application/pdf",
] as const;
export type AttachmentType = (typeof ALLOWED_TYPES)[number];

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_ITEM = 5;
const MAX_FILE_NAME = 120;

export function isAllowedType(type: string | undefined): type is AttachmentType {
	return ALLOWED_TYPES.includes(type as AttachmentType);
}

export function isImageType(type: string) {
	return type.startsWith("image/");
}

/** Control, DEL, bidi embedding/override/isolate characters and quotes. */
function isUnsafeChar(code: number) {
	return code < 0x20 || code === 0x7f || code === 0x22 ||
		(code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
}

/**
 * Display name for a client-supplied file name: no path, no control or
 * bidi-override characters, bounded length. Falls back to "attachment".
 */
export function cleanFileName(raw: string) {
	const base = raw.split(/[\\/]/).pop() ?? "";
	const cleaned = [...base]
		.filter((char) => !isUnsafeChar(char.codePointAt(0) ?? 0))
		.join("")
		.trim()
		.slice(0, MAX_FILE_NAME);
	return cleaned || "attachment";
}

/**
 * Whether the file's leading bytes match its declared type. The declared
 * Content-Type comes from the uploading client, so this catches renamed or
 * disguised files before anyone can open them.
 */
export function matchesSignature(type: AttachmentType, bytes: Uint8Array) {
	const startsWith = (signature: readonly number[], offset = 0) =>
		bytes.length >= offset + signature.length &&
		signature.every((byte, index) => bytes[offset + index] === byte);
	switch (type) {
		case "image/png":
			return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		case "image/jpeg":
			return startsWith([0xff, 0xd8, 0xff]);
		case "image/gif":
			return startsWith([0x47, 0x49, 0x46, 0x38]); // "GIF8"
		case "image/webp":
			// "RIFF" .... "WEBP"
			return startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8);
		case "application/pdf":
			return startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
	}
}
