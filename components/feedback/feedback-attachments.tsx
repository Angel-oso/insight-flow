"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { FileDown, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { ConfirmDialog, errorMessage } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	ALLOWED_TYPES,
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS_PER_ITEM,
} from "@/convex/attachments/model";

/** Signed links last 15 minutes; refresh this long before they expire. */
const REFRESH_MARGIN_MS = 3 * 60_000;
/** A link this close to expiry is re-minted before it is opened. */
const OPEN_MARGIN_MS = 15_000;
const RETRY_MS = 30_000;

/** Whether a link expiring at `expiresAt` has less than `marginMs` left. */
function expiresWithin(expiresAt: number, marginMs: number) {
	return Date.now() >= expiresAt - marginMs;
}

function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Attachments of one feedback item. Images render as <img> and PDFs only as
 * download links: user files are never embedded (no iframe/object/SVG).
 * Links come from short-lived signed URLs minted on demand.
 */
export function FeedbackAttachments({ feedbackId }: { readonly feedbackId: Id<"feedback"> }) {
	const { projectSlug } = useParams<{ projectSlug: string }>();
	const data = useQuery(api.attachments.files.list, { projectSlug, feedbackId });
	const createUploadTicket = useMutation(api.attachments.files.createUploadTicket);
	const authToken = useAuthToken();
	const remove = useMutation(api.attachments.files.remove);
	const issueUrls = useMutation(api.attachments.files.issueUrls);
	const [urls, setUrls] = useState<Record<string, string>>({});
	const [linkError, setLinkError] = useState<string | null>(null);
	const expiresAtRef = useRef(0);
	const refreshRef = useRef<(() => Promise<Record<string, string> | null>) | null>(null);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [removing, setRemoving] = useState<{ id: Id<"feedbackAttachments">; name: string } | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const verifiedKey = useMemo(
		() => (data?.attachments ?? []).filter((row) => row.verified).map((row) => row._id).join(","),
		[data],
	);

	// Timers are throttled in background tabs, so the refresh is scheduled from
	// the server's expiry and re-checked when the tab is shown again.
	useEffect(() => {
		if (!verifiedKey) return;
		let cancelled = false;
		let timer: number | undefined;
		let inFlight: Promise<Record<string, string> | null> | null = null;
		const schedule = (delay: number) => {
			window.clearTimeout(timer);
			timer = window.setTimeout(() => void refresh(), Math.max(delay, 1000));
		};
		const refresh = () =>
			(inFlight ??= issueUrls({ projectSlug, feedbackId })
				.then(({ urls: issued, expiresAt }) => {
					const next = Object.fromEntries(issued.map((entry) => [entry.attachmentId, entry.url]));
					if (cancelled) return null;
					expiresAtRef.current = expiresAt;
					setUrls(next);
					setLinkError(null);
					schedule(expiresAt - Date.now() - REFRESH_MARGIN_MS);
					return next;
				})
				.catch(() => {
					if (cancelled) return null;
					// Keep links that are still valid; drop them only once expired.
					if (Date.now() >= expiresAtRef.current) setUrls({});
					setLinkError("Could not refresh the file links. Retrying…");
					schedule(RETRY_MS);
					return null;
				})
				.finally(() => {
					inFlight = null;
				}));
		const refreshIfStale = () => {
			if (document.visibilityState === "visible" && Date.now() >= expiresAtRef.current - REFRESH_MARGIN_MS) {
				void refresh();
			}
		};
		refreshRef.current = refresh;
		void refresh();
		document.addEventListener("visibilitychange", refreshIfStale);
		window.addEventListener("focus", refreshIfStale);
		return () => {
			cancelled = true;
			refreshRef.current = null;
			window.clearTimeout(timer);
			document.removeEventListener("visibilitychange", refreshIfStale);
			window.removeEventListener("focus", refreshIfStale);
		};
	}, [verifiedKey, projectSlug, feedbackId, issueUrls]);

	/** Opens a link, minting a fresh one first if it has (nearly) expired. */
	const openLink = (event: MouseEvent<HTMLAnchorElement>, attachmentId: string) => {
		if (!expiresWithin(expiresAtRef.current, OPEN_MARGIN_MS) || !refreshRef.current) return;
		event.preventDefault();
		void refreshRef.current().then((fresh) => {
			const url = fresh?.[attachmentId];
			if (url) window.open(url, "_blank", "noopener,noreferrer");
		});
	};

	if (!data) return null;
	const { attachments, canManage } = data;
	if (attachments.length === 0 && !canManage) return null;
	const full = attachments.length >= MAX_ATTACHMENTS_PER_ITEM;

	const uploadFiles = async (files: FileList | null) => {
		if (!files || files.length === 0) return;
		setError(null);
		const list = [...files].slice(0, MAX_ATTACHMENTS_PER_ITEM - attachments.length);
		setUploading(true);
		try {
			for (const file of list) {
				if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
					setError(`${file.name}: attach PNG, JPEG, WebP or GIF images, or PDF files.`);
					continue;
				}
				if (file.size > MAX_ATTACHMENT_BYTES) {
					setError(`${file.name}: files can be at most 10 MB.`);
					continue;
				}
				if (!authToken) throw new Error("signed out");
				// One single-use ticket per file; the route stores and registers it.
				const { uploadUrl, ticket } = await createUploadTicket({ projectSlug, feedbackId });
				const response = await fetch(uploadUrl, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${authToken}`,
						"Content-Type": file.type,
						"X-Upload-Ticket": ticket,
						"X-File-Name": encodeURIComponent(file.name),
					},
					body: file,
				});
				const result = (await response.json().catch(() => null)) as
					| { ok: true; attachmentId: string }
					| { ok: false; error: string }
					| null;
				if (!result) throw new Error("upload failed");
				if (!result.ok) setError(`${file.name}: ${result.error}`);
			}
		} catch (cause) {
			setError(errorMessage(cause, "Could not upload the file. Please try again."));
		} finally {
			setUploading(false);
			if (inputRef.current) inputRef.current.value = "";
		}
	};

	return (
		<section>
			<div className="flex items-center justify-between gap-3">
				<h3 className="flex items-center gap-1.5 font-heading text-sm font-semibold">
					<Paperclip className="size-4 text-muted-foreground" />
					Attachments
				</h3>
				{canManage ? (
					<>
						<input
							ref={inputRef}
							type="file"
							className="sr-only"
							accept={ALLOWED_TYPES.join(",")}
							multiple
							tabIndex={-1}
							aria-hidden
							onChange={(event) => void uploadFiles(event.target.files)}
						/>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={uploading || full}
							onClick={() => inputRef.current?.click()}
						>
							{uploading ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Upload data-icon="inline-start" />}
							{uploading ? "Uploading…" : "Attach file"}
						</Button>
					</>
				) : null}
			</div>
			<p className="mt-1 text-xs text-muted-foreground">
				Images or PDFs, up to 10 MB each, {MAX_ATTACHMENTS_PER_ITEM} per item. Visible to your project team.
			</p>
			{error ? (
				<p role="alert" className="mt-2 text-sm text-destructive">
					{error}
				</p>
			) : null}
			{linkError ? (
				<p role="alert" className="mt-2 text-sm text-destructive">
					{linkError}
				</p>
			) : null}
			{attachments.length > 0 ? (
				<ul className="mt-3 grid gap-3 sm:grid-cols-2">
					{attachments.map((row) => {
						const url = urls[row._id];
						const isImage = row.contentType.startsWith("image/");
						return (
							<li key={row._id} className="flex min-w-0 flex-col gap-2 rounded-lg border p-2">
								{isImage && url ? (
									<a
										href={url}
										target="_blank"
										rel="noopener noreferrer"
										onClick={(event) => openLink(event, row._id)}
										className="block overflow-hidden rounded-md bg-muted"
									>
										{/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL on the Convex site origin */}
										<img
											src={url}
											alt={row.fileName}
											loading="lazy"
											referrerPolicy="no-referrer"
											className="h-32 w-full object-cover"
										/>
									</a>
								) : null}
								<div className="flex min-w-0 items-center gap-2">
									<div className="min-w-0 flex-1">
										{url ? (
											<a
												href={url}
												target="_blank"
												rel="noopener noreferrer"
												onClick={(event) => openLink(event, row._id)}
												className="flex items-center gap-1.5 truncate text-sm font-medium hover:underline"
											>
												{isImage ? null : <FileDown className="size-4 shrink-0 text-muted-foreground" />}
												<span className="truncate">{row.fileName}</span>
											</a>
										) : (
											<p className="truncate text-sm font-medium">{row.fileName}</p>
										)}
										<p className="text-xs text-muted-foreground">
											{row.verified ? formatSize(row.size) : "Checking file…"} · {row.uploadedBy}
										</p>
									</div>
									{canManage ? (
										<Button
											type="button"
											size="icon-sm"
											variant="ghost"
											aria-label={`Remove ${row.fileName}`}
											onClick={() => setRemoving({ id: row._id, name: row.fileName })}
										>
											<Trash2 />
										</Button>
									) : null}
								</div>
							</li>
						);
					})}
				</ul>
			) : (
				<p className="mt-3 text-sm text-muted-foreground">No files attached.</p>
			)}
			<ConfirmDialog
				open={removing !== null}
				onOpenChange={(open) => {
					if (!open) setRemoving(null);
				}}
				title="Remove this attachment?"
				description={
					<>
						<span className="font-medium text-foreground">{removing?.name}</span> will be deleted for
						everyone. This cannot be undone.
					</>
				}
				confirmLabel="Remove attachment"
				pendingLabel="Removing…"
				onConfirm={async () => {
					if (removing) await remove({ projectSlug, attachmentId: removing.id });
				}}
			/>
		</section>
	);
}
