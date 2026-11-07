"use client";

import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { Loader2, MailCheck } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";

function messageOf(error: unknown, fallback: string) {
	return error instanceof ConvexError && typeof error.data === "string"
		? error.data
		: fallback;
}

/** Runs `action` on Enter instead of submitting the surrounding form. */
function onEnter(action: () => void) {
	return (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Enter") return;
		event.preventDefault();
		action();
	};
}

/**
 * Email change for password accounts. The new address must be confirmed
 * with a code sent to it before it becomes the sign-in email, so nobody can
 * claim an address they don't own. Lives inside the account dialog's form,
 * so its controls are plain buttons.
 */
export function AccountEmailChange({
	currentEmail,
	pendingEmail,
	hasPassword,
}: {
	readonly currentEmail: string;
	readonly pendingEmail: string | null;
	readonly hasPassword: boolean;
}) {
	const requestChange = useAction(api.users.account.requestEmailChange);
	const confirmChange = useAction(api.users.account.confirmEmailChange);
	const cancelChange = useMutation(api.users.account.cancelEmailChange);
	const [editing, setEditing] = useState(false);
	const [newEmail, setNewEmail] = useState("");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState<"idle" | "request" | "confirm" | "cancel">("idle");
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	if (!hasPassword) {
		return (
			<div className="space-y-1.5">
				<label className="text-sm font-medium" htmlFor="account-email">
					Email
				</label>
				<Input id="account-email" type="email" value={currentEmail} disabled readOnly />
				<p className="text-xs text-muted-foreground">
					Your email is managed by your sign-in provider.
				</p>
			</div>
		);
	}

	async function handleRequest() {
		if (!newEmail.trim() || !password) {
			setError("Enter the new email and your current password.");
			return;
		}
		setBusy("request");
		setError(null);
		setNotice(null);
		try {
			await requestChange({ email: newEmail, currentPassword: password });
			setPassword("");
			setCode("");
			setEditing(false);
			setNotice(`We sent an 8-digit code to ${newEmail.trim().toLowerCase()}.`);
		} catch (cause) {
			setError(messageOf(cause, "We couldn't send the code. Try again."));
		} finally {
			setBusy("idle");
		}
	}

	async function handleConfirm() {
		if (!/^\d{8}$/.test(code)) {
			setError("Enter the 8-digit code from the email.");
			return;
		}
		setBusy("confirm");
		setError(null);
		setNotice(null);
		try {
			const { email } = await confirmChange({ code });
			setCode("");
			setNewEmail("");
			setNotice(`Your sign-in email is now ${email}. Other sessions were signed out.`);
		} catch (cause) {
			setError(messageOf(cause, "We couldn't confirm the code. Try again."));
		} finally {
			setBusy("idle");
		}
	}

	async function handleCancel() {
		setBusy("cancel");
		setError(null);
		try {
			await cancelChange({});
			setCode("");
			setNotice(null);
		} catch (cause) {
			setError(messageOf(cause, "We couldn't cancel the change. Try again."));
		} finally {
			setBusy("idle");
		}
	}

	return (
		<div className="space-y-3">
			<div className="space-y-1.5">
				<div className="flex items-baseline justify-between gap-3">
					<label className="text-sm font-medium" htmlFor="account-email">
						Email
					</label>
					{!editing && !pendingEmail ? (
						<Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => {
							setEditing(true);
							setError(null);
							setNotice(null);
						}}>
							Change email
						</Button>
					) : null}
				</div>
				<Input id="account-email" type="email" value={currentEmail} disabled readOnly />
			</div>

			{editing ? (
				<div className="space-y-3 rounded-lg border p-3">
					<div className="space-y-1.5">
						<label className="text-sm font-medium" htmlFor="account-new-email">
							New email
						</label>
						<Input
							id="account-new-email"
							type="email"
							autoComplete="email"
							value={newEmail}
							onChange={(event) => setNewEmail(event.target.value)}
							onKeyDown={onEnter(() => void handleRequest())}
						/>
					</div>
					<div className="space-y-1.5">
						<label className="text-sm font-medium" htmlFor="account-email-password">
							Current password
						</label>
						<Input
							id="account-email-password"
							type="password"
							autoComplete="current-password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							onKeyDown={onEnter(() => void handleRequest())}
						/>
					</div>
					<p className="text-xs leading-5 text-muted-foreground">
						We&apos;ll email a code to the new address. Your email changes only after
						you enter it.
					</p>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="ghost" size="sm" onClick={() => {
							setEditing(false);
							setError(null);
						}}>
							Cancel
						</Button>
						<Button type="button" size="sm" disabled={busy !== "idle"} onClick={() => void handleRequest()}>
							{busy === "request" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
							Send code
						</Button>
					</div>
				</div>
			) : null}

			{pendingEmail && !editing ? (
				<div className="space-y-3 rounded-lg border p-3">
					<div className="flex items-start gap-2 text-sm leading-6">
						<MailCheck className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
						<p>
							Confirm <span className="font-medium break-all">{pendingEmail}</span> with the
							8-digit code we sent there. Codes expire after 15 minutes.
						</p>
					</div>
					<div className="space-y-1.5">
						<label className="text-sm font-medium" htmlFor="account-email-code">
							Verification code
						</label>
						<Input
							id="account-email-code"
							inputMode="numeric"
							autoComplete="one-time-code"
							maxLength={8}
							placeholder="12345678"
							className="font-mono tracking-[0.3em]"
							value={code}
							onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
							onKeyDown={onEnter(() => void handleConfirm())}
						/>
					</div>
					<div className="flex flex-wrap justify-end gap-2">
						<Button type="button" variant="ghost" size="sm" disabled={busy !== "idle"} onClick={() => void handleCancel()}>
							Cancel change
						</Button>
						<Button type="button" variant="outline" size="sm" disabled={busy !== "idle"} onClick={() => {
							setNewEmail(pendingEmail);
							setEditing(true);
							setNotice(null);
						}}>
							Request a new code
						</Button>
						<Button type="button" size="sm" disabled={busy !== "idle"} onClick={() => void handleConfirm()}>
							{busy === "confirm" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
							Confirm email
						</Button>
					</div>
				</div>
			) : null}

			{error ? (
				<p className="text-sm text-destructive" role="alert">
					{error}
				</p>
			) : null}
			{notice ? (
				<p className="text-sm text-muted-foreground" role="status">
					{notice}
				</p>
			) : null}
		</div>
	);
}
