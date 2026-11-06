"use client";

import { ConvexError } from "convex/values";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** User-facing text of a Convex error, or `fallback` for anything else. */
export function errorMessage(cause: unknown, fallback: string) {
	return cause instanceof ConvexError && typeof cause.data === "string" ? cause.data : fallback;
}

/**
 * Confirmation for destructive actions. With `confirmText`, the confirm
 * button stays disabled until that exact text is typed (project,
 * organization and account deletion). `onConfirm` receives the trimmed
 * typed text so the server can verify what the user actually typed; its
 * errors are shown inline and the dialog closes itself on success.
 * `confirmDisabled` keeps it disabled until extra fields in `children`
 * (e.g. a password) are filled.
 */
export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	pendingLabel,
	confirmText,
	confirmTextLabel,
	confirmDisabled = false,
	onConfirm,
	children,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly title: string;
	readonly description: ReactNode;
	readonly confirmLabel: string;
	readonly pendingLabel: string;
	readonly confirmText?: string;
	readonly confirmTextLabel?: ReactNode;
	readonly confirmDisabled?: boolean;
	readonly onConfirm: (typed: string) => Promise<void>;
	readonly children?: ReactNode;
}) {
	const [typed, setTyped] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const matches =
		!confirmDisabled &&
		(confirmText === undefined || typed.trim() === confirmText.trim());

	function change(next: boolean) {
		if (busy) return;
		// Closing resets the form, so the next opening starts empty.
		if (!next) {
			setTyped("");
			setError(null);
		}
		onOpenChange(next);
	}

	async function confirm() {
		if (!matches || busy) return;
		setBusy(true);
		setError(null);
		try {
			await onConfirm(typed.trim());
			setTyped("");
			onOpenChange(false);
		} catch (cause) {
			setError(errorMessage(cause, "Something went wrong. Please try again."));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={change}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				{children || confirmText !== undefined || error ? (
					<div className="space-y-3 px-5">
						{children}
						{confirmText !== undefined ? (
							<label className="grid gap-2 text-sm font-medium">
								<span>
									{confirmTextLabel ?? (
										<>
											Type <span className="font-semibold">{confirmText}</span> to confirm
										</>
									)}
								</span>
								<Input
									value={typed}
									autoComplete="off"
									spellCheck={false}
									disabled={busy}
									onChange={(event) => setTyped(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											void confirm();
										}
									}}
								/>
							</label>
						) : null}
						{error ? (
							<p role="alert" className="text-sm text-destructive">
								{error}
							</p>
						) : null}
					</div>
				) : null}
				<DialogFooter>
					<Button variant="outline" disabled={busy} onClick={() => change(false)}>
						Cancel
					</Button>
					<Button variant="destructive" disabled={busy || !matches} onClick={() => void confirm()}>
						{busy ? pendingLabel : confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
