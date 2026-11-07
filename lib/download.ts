/**
 * Saves `body` as a file. The anchor must be in the document for Firefox to
 * honor the click, and the blob URL is revoked only after the download has
 * had time to start.
 */
export function downloadFile(fileName: string, type: string, body: BlobPart) {
	const url = URL.createObjectURL(new Blob([body], { type }));
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.append(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
