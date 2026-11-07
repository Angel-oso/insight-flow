"use client";

import { useConvex, useMutation } from "convex/react";
import { Download, Eraser } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog, errorMessage } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { downloadFile as download } from "@/lib/download";

type Format = "csv" | "json";

/** Rows requested per export page (the server caps it). */
const EXPORT_PAGE_SIZE = 200;

/**
 * "Data & privacy" for project administrators (project.manage): export the
 * project's feedback and erase one submitter's personal data. Both actions
 * are rate-limited and recorded in the organization audit log.
 */
export function DataTools({
	projectSlug,
	disabled,
}: {
	readonly projectSlug: string;
	readonly disabled: boolean;
}) {
	const convex = useConvex();
	const startExport = useMutation(api.feedback.export.start);
	const redactSender = useMutation(api.feedback.privacy.redactSender);
	const [exporting, setExporting] = useState<Format | null>(null);
	const [progress, setProgress] = useState<string | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [confirming, setConfirming] = useState(false);
	const [redactResult, setRedactResult] = useState<string | null>(null);

	async function runExport(format: Format) {
		if (exporting) return;
		setExporting(format);
		setExportError(null);
		setProgress(null);
		try {
			const { exportId, header, total } = await startExport({ projectSlug, format });
			const lines: string[] = [];
			let cursor: string | null = null;
			for (;;) {
				const page: { page: string[]; isDone: boolean; continueCursor: string } =
					await convex.query(api.feedback.export.page, {
						projectSlug,
						exportId,
						paginationOpts: { numItems: EXPORT_PAGE_SIZE, cursor },
					});
				lines.push(...page.page);
				setProgress(`${lines.length} of ${total} items`);
				if (page.isDone) break;
				cursor = page.continueCursor;
			}
			const stamp = new Date().toISOString().slice(0, 10);
			if (format === "csv")
				download(
					`${projectSlug}-feedback-${stamp}.csv`,
					"text/csv;charset=utf-8",
					// BOM so spreadsheet apps read UTF-8 correctly.
					`﻿${[header ?? "", ...lines].join("\r\n")}\r\n`,
				);
			else
				download(
					`${projectSlug}-feedback-${stamp}.json`,
					"application/json",
					lines.length ? `[\n${lines.join(",\n")}\n]\n` : "[]\n",
				);
			setProgress(`Exported ${lines.length} item${lines.length === 1 ? "" : "s"}.`);
		} catch (cause) {
			setExportError(errorMessage(cause, "The export failed. Please try again."));
			setProgress(null);
		} finally {
			setExporting(null);
		}
	}

	const cleanEmail = email.trim();
	const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);

	return (
		<Card className="gap-0 py-0 shadow-none">
			<CardHeader className="border-b px-5 py-5 sm:px-6">
				<CardTitle>Data &amp; privacy</CardTitle>
				<CardDescription>
					Export this project&apos;s feedback, or erase a submitter&apos;s name and email
					when they ask. Both actions are recorded in the audit log.
				</CardDescription>
			</CardHeader>
			<CardContent className="divide-y px-5 py-0 sm:px-6">
				<section className="grid gap-3 py-5">
					<div>
						<h3 className="text-sm font-medium">Export feedback</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							Every item with its classification, owner and submitter details.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={disabled || exporting !== null}
							onClick={() => void runExport("csv")}
						>
							<Download data-icon="inline-start" />
							{exporting === "csv" ? "Exporting…" : "Export CSV"}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={disabled || exporting !== null}
							onClick={() => void runExport("json")}
						>
							<Download data-icon="inline-start" />
							{exporting === "json" ? "Exporting…" : "Export JSON"}
						</Button>
						{progress ? (
							<span role="status" className="text-xs text-muted-foreground">
								{progress}
							</span>
						) : null}
					</div>
					{exportError ? (
						<p role="alert" className="text-sm text-destructive">
							{exportError}
						</p>
					) : null}
				</section>
				<section className="grid gap-3 py-5">
					<div>
						<h3 className="text-sm font-medium">Erase a submitter</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							Removes the name and email from every item in this project sent with this
							address. The feedback itself stays.
						</p>
					</div>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Input
							type="email"
							aria-label="Submitter email"
							placeholder="person@example.com"
							value={email}
							maxLength={254}
							disabled={disabled}
							onChange={(event) => {
								setEmail(event.target.value);
								setRedactResult(null);
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									if (validEmail) setConfirming(true);
								}
							}}
							className="sm:max-w-xs"
						/>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							disabled={disabled || !validEmail}
							onClick={() => setConfirming(true)}
						>
							<Eraser data-icon="inline-start" />
							Erase submitter data
						</Button>
					</div>
					{redactResult ? (
						<p role="status" className="text-sm text-muted-foreground">
							{redactResult}
						</p>
					) : null}
				</section>
			</CardContent>
			<ConfirmDialog
				open={confirming}
				onOpenChange={setConfirming}
				title="Erase this submitter's data?"
				description={
					<>
						The name and email of{" "}
						<span className="font-medium text-foreground">{cleanEmail}</span> will be removed
						from all feedback in this project. This cannot be undone.
					</>
				}
				confirmLabel="Erase data"
				pendingLabel="Erasing…"
				onConfirm={async () => {
					const result = await redactSender({ projectSlug, email: cleanEmail });
					setEmail("");
					setRedactResult(
						result.done
							? `Erased from ${result.redacted} item${result.redacted === 1 ? "" : "s"}.`
							: `Erased from ${result.redacted} items so far; the rest of the project is being processed.`,
					);
				}}
			/>
		</Card>
	);
}
