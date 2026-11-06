"use client";

import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { userFacingError } from "@/lib/errors";
import { CAPTCHA_REQUIRED, useAuthCaptcha, type CaptchaParams } from "./auth-captcha";

const RESEND_COOLDOWN_SECONDS = 30;

export function FormAlert({ children }: { readonly children: ReactNode }) {
	return (
		<p
			role="alert"
			className="rounded-lg bg-destructive/10 px-3 py-2.5 text-xs leading-5 text-destructive"
		>
			{children}
		</p>
	);
}

export function FormNotice({ children }: { readonly children: ReactNode }) {
	return (
		<p
			role="status"
			className="rounded-lg bg-muted px-3 py-2.5 text-xs leading-5 text-muted-foreground"
		>
			{children}
		</p>
	);
}

/** Digits only, at most 8 — tolerant of pasted codes with spaces. */
export function cleanCode(value: string) {
	return value.replace(/\D/g, "").slice(0, 8);
}

/** Countdown that gates the "Resend code" button. */
export function useResendCooldown() {
	const [seconds, setSeconds] = useState(RESEND_COOLDOWN_SECONDS);
	useEffect(() => {
		if (seconds <= 0) return;
		const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
		return () => window.clearTimeout(timer);
	}, [seconds]);
	return {
		seconds,
		restart: () => setSeconds(RESEND_COOLDOWN_SECONDS),
	};
}

export function CodeInput({
	id,
	value,
	onChange,
	error,
	disabled,
}: {
	readonly id: string;
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly error?: string;
	readonly disabled?: boolean;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={id} className="text-sm font-medium">
				Verification code
			</label>
			<Input
				id={id}
				name="code"
				inputMode="numeric"
				autoComplete="one-time-code"
				pattern="[0-9]{8}"
				maxLength={8}
				placeholder="12345678"
				value={value}
				onChange={(event) => onChange(cleanCode(event.target.value))}
				disabled={disabled}
				aria-invalid={Boolean(error)}
				aria-describedby={error ? `${id}-error` : undefined}
				className="font-mono text-base tracking-[0.3em]"
				autoFocus
			/>
			{error ? (
				<p id={`${id}-error`} role="alert" className="text-xs text-destructive">
					{error}
				</p>
			) : null}
		</div>
	);
}

export function ResendCodeButton({
	seconds,
	busy,
	onResend,
}: {
	readonly seconds: number;
	readonly busy: boolean;
	readonly onResend: () => void;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			disabled={busy || seconds > 0}
			onClick={onResend}
		>
			{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
			{seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}
		</Button>
	);
}

/**
 * "Enter the code we emailed" step shared by sign-up and sign-in of an
 * account whose email is not verified yet.
 */
export function EmailCodeStep({
	email,
	onVerify,
	onResend,
	onBack,
	backLabel = "Use a different email",
	hint,
}: {
	readonly email: string;
	/**
	 * Resolves true when the session is starting. After a wrong code the
	 * server wants a captcha with every attempt; the params carry it.
	 */
	readonly onVerify: (code: string, captcha: CaptchaParams) => Promise<boolean>;
	/** Requests a new code; the params carry the captcha token. */
	readonly onResend: (captcha: CaptchaParams) => Promise<void>;
	readonly onBack: () => void;
	readonly backLabel?: string;
	/** Extra line under the "check your email" message. */
	readonly hint?: string;
}) {
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState<"idle" | "verify" | "resend">("idle");
	const cooldown = useResendCooldown();
	const captcha = useAuthCaptcha();
	// The server asks for a captcha on every attempt once a code was wrong.
	const [captchaNeeded, setCaptchaNeeded] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (code.length !== 8) {
			setError("Enter the 8-digit code from the email.");
			return;
		}
		if (captchaNeeded && !captcha.ready) {
			setError(CAPTCHA_REQUIRED);
			return;
		}
		setError(null);
		setNotice(null);
		setBusy("verify");
		try {
			const ok = await onVerify(code, captchaNeeded ? captcha.take() : {});
			// On success the session starts and the page redirects; stay busy.
			if (!ok) setBusy("idle");
		} catch (cause) {
			setBusy("idle");
			setCaptchaNeeded(true);
			setError(userFacingError(cause, "We couldn't verify that code. Try again."));
		}
	}

	async function handleResend() {
		setError(null);
		setNotice(null);
		if (!captcha.ready) {
			setError(CAPTCHA_REQUIRED);
			return;
		}
		setBusy("resend");
		try {
			await onResend(captcha.take());
			setCode("");
			setNotice(`We sent a new code to ${email}.`);
			cooldown.restart();
		} catch (cause) {
			setError(userFacingError(cause, "We couldn't send a new code. Try again in a moment."));
		} finally {
			setBusy("idle");
		}
	}

	return (
		<form onSubmit={handleSubmit} noValidate className="space-y-4">
			<div className="flex items-start gap-3 rounded-lg border px-3 py-3">
				<MailCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
				<div className="min-w-0 text-sm leading-6">
					<p className="font-medium">Check your email</p>
					<p className="text-muted-foreground">
						We sent an 8-digit code to{" "}
						<span className="font-medium break-all text-foreground">{email}</span>. It
						expires in 15 minutes.
					</p>
				</div>
			</div>

			{error ? <FormAlert>{error}</FormAlert> : null}
			{notice ? <FormNotice>{notice}</FormNotice> : null}

			<CodeInput
				id="email-code"
				value={code}
				onChange={setCode}
				disabled={busy === "verify"}
			/>

			<Button type="submit" size="lg" className="w-full" disabled={busy !== "idle"}>
				{busy === "verify" ? (
					<>
						<Loader2 className="animate-spin" aria-hidden="true" />
						Verifying…
					</>
				) : (
					"Verify and continue"
				)}
			</Button>

			{captcha.widget}

			<div className="flex items-center justify-between gap-2">
				<Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={busy === "verify"}>
					<ArrowLeft aria-hidden="true" />
					{backLabel}
				</Button>
				<ResendCodeButton
					seconds={cooldown.seconds}
					busy={busy === "resend"}
					onResend={() => void handleResend()}
				/>
			</div>
			<p className="text-xs leading-5 text-muted-foreground">
				Can&apos;t find it? Check your spam folder, or resend the code.
				{hint ? ` ${hint}` : null}
			</p>
		</form>
	);
}
