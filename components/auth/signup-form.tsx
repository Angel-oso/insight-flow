"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { useConvexAuth } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CAPTCHA_REQUIRED, useAuthCaptcha } from "./auth-captcha";
import { authErrorMessage, EMAIL_PATTERN, normalizeEmail } from "./auth-errors";
import { EmailCodeStep, FormAlert } from "./email-code-step";
import { GoogleMark } from "./google-mark";
import { useSafeNext } from "./use-safe-next";

type Errors = { name?: string; email?: string; password?: string; form?: string };

function validate(name: string, email: string, password: string): Errors {
	const errors: Errors = {};
	if (name.trim().length < 2) {
		errors.name = "Tell us your name — at least 2 characters.";
	}
	if (!EMAIL_PATTERN.test(email.trim())) {
		errors.email = "Enter a valid email address, like you@studio.com.";
	}
	if (password.length < 8 || password.length > 128) {
		errors.password = "Choose a password between 8 and 128 characters.";
	}
	return errors;
}

export function SignupForm() {
	const { signIn } = useAuthActions();
	const { isAuthenticated } = useConvexAuth();
	const [showPassword, setShowPassword] = useState(false);
	const [errors, setErrors] = useState<Errors>({});
	const [busy, setBusy] = useState<"idle" | "google" | "password">("idle");
	const [pending, setPending] = useState<{ name: string; email: string; password: string } | null>(null);
	const safeNext = useSafeNext();
	const captcha = useAuthCaptcha();

	useEffect(() => {
		if (busy === "idle" || isAuthenticated) return;

		const timeout = window.setTimeout(() => {
			setBusy("idle");
			setErrors({
				form: "Account creation did not finish. Check your connection and try again.",
			});
		}, 15000);
		return () => window.clearTimeout(timeout);
	}, [busy, isAuthenticated]);

	async function handleGoogle() {
		setErrors({});
		setBusy("google");
		try {
			// Back to the page that sent the visitor here (e.g. an invitation).
			const result = await signIn("google", { redirectTo: safeNext ?? "/home" });
			if (!result.redirect && !result.signingIn) {
				setBusy("idle");
				setErrors({ form: "Google sign-up did not start. Try again." });
			}
		} catch (error) {
			setBusy("idle");
			setErrors({ form: authErrorMessage(error, "google") });
		}
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const name = String(data.get("name") ?? "").trim();
		const email = normalizeEmail(String(data.get("email") ?? ""));
		const password = String(data.get("password") ?? "");
		const next = validate(name, email, password);
		setErrors(next);
		if (Object.keys(next).length > 0) return;
		if (!captcha.ready) {
			setErrors({ form: CAPTCHA_REQUIRED });
			return;
		}

		setBusy("password");
		try {
			const result = await signIn("password", {
				name,
				email,
				password,
				flow: "signUp",
				...captcha.take(),
			});
			if (!result.signingIn) {
				// A code is on its way, or (when the address already has an
				// account) a notice to its owner: both look the same here.
				setBusy("idle");
				setPending({ name, email, password });
			}
		} catch (error) {
			setBusy("idle");
			setErrors({ form: authErrorMessage(error, "signUp") });
		}
	}

	if (pending) {
		return (
			<EmailCodeStep
				email={pending.email}
				onVerify={async (code, captchaParams) => {
					try {
						const result = await signIn("password", {
							email: pending.email,
							// The code only counts together with the account's password.
							password: pending.password,
							code,
							flow: "email-verification",
							...captchaParams,
						});
						if (!result.signingIn) throw new Error(authErrorMessage(null, "verify"));
						// The session is starting; don't keep the password around.
						setPending((current) => (current ? { ...current, password: "" } : current));
						return true;
					} catch (error) {
						throw new Error(authErrorMessage(error, "verify"));
					}
				}}
				onResend={async (captchaParams) => {
					try {
						// The account exists now: signing in again sends a fresh code.
						await signIn("password", {
							email: pending.email,
							password: pending.password,
							flow: "signIn",
							...captchaParams,
						});
					} catch (error) {
						throw new Error(authErrorMessage(error, "resend"));
					}
				}}
				onBack={() => {
					setErrors({});
					setPending(null);
				}}
				backLabel="Back"
				hint="Already have an account with this email? Then we emailed you a sign-in reminder instead of a code: sign in or reset your password."
			/>
		);
	}

	return (
		<div>
			<Button
				type="button"
				variant="outline"
				size="lg"
				className="w-full"
				disabled={busy !== "idle"}
				onClick={handleGoogle}
			>
				{busy === "google" ? (
					<Loader2 className="animate-spin" aria-hidden="true" />
				) : (
					<GoogleMark />
				)}
				Continue with Google
			</Button>

			<div
				aria-hidden="true"
				className="my-5 flex items-center gap-3 text-xs text-muted-foreground"
			>
				<span className="h-px flex-1 bg-border" />
				<span>or create an account with email</span>
				<span className="h-px flex-1 bg-border" />
			</div>

			<form onSubmit={handleSubmit} noValidate className="space-y-4">
				{errors.form ? <FormAlert>{errors.form}</FormAlert> : null}

				<div className="space-y-1.5">
					<label htmlFor="signup-name" className="text-sm font-medium">
						Full name
					</label>
					<Input
						id="signup-name"
						name="name"
						type="text"
						autoComplete="name"
						placeholder="Ada Lovelace"
						aria-invalid={Boolean(errors.name)}
						aria-describedby={errors.name ? "signup-name-error" : undefined}
					/>
					{errors.name ? (
						<p id="signup-name-error" role="alert" className="text-xs text-destructive">
							{errors.name}
						</p>
					) : null}
				</div>

				<div className="space-y-1.5">
					<label htmlFor="signup-email" className="text-sm font-medium">
						Work email
					</label>
					<Input
						id="signup-email"
						name="email"
						type="email"
						autoComplete="email"
						placeholder="you@studio.com"
						aria-invalid={Boolean(errors.email)}
						aria-describedby={errors.email ? "signup-email-error" : undefined}
					/>
					{errors.email ? (
						<p
							id="signup-email-error"
							role="alert"
							className="text-xs text-destructive"
						>
							{errors.email}
						</p>
					) : null}
				</div>

				<div className="space-y-1.5">
					<label htmlFor="signup-password" className="text-sm font-medium">
						Password
					</label>
					<div className="relative">
						<Input
							id="signup-password"
							name="password"
							type={showPassword ? "text" : "password"}
							autoComplete="new-password"
							placeholder="8+ characters"
							className="pr-10"
							aria-invalid={Boolean(errors.password)}
							aria-describedby={
								errors.password ? "signup-password-error" : undefined
							}
						/>
						<button
							type="button"
							onClick={() => setShowPassword((value) => !value)}
							aria-label={showPassword ? "Hide password" : "Show password"}
							aria-pressed={showPassword}
							className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
						>
							{showPassword ? (
								<EyeOff className="size-4" />
							) : (
								<Eye className="size-4" />
							)}
						</button>
					</div>
					{errors.password ? (
						<p
							id="signup-password-error"
							role="alert"
							className="text-xs text-destructive"
						>
							{errors.password}
						</p>
					) : (
						<p className="text-xs text-muted-foreground">
							Use 8–128 characters. Your password is hashed with scrypt and
							never stored in plain text.
						</p>
					)}
				</div>

				{captcha.widget}

				<Button
					type="submit"
					size="lg"
					className="w-full"
					disabled={busy !== "idle"}
				>
					{busy === "password" ? (
						<>
							<Loader2 className="animate-spin" aria-hidden="true" />
							Creating account…
						</>
					) : (
						"Create account"
					)}
				</Button>

				<p className="text-xs leading-5 text-muted-foreground">
					By creating an account you agree to the{" "}
					<Link href="/terms" className="underline underline-offset-4 hover:text-foreground">Terms of Service</Link>{" "}
					and{" "}
					<Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">Privacy Policy</Link>.
				</p>
			</form>
		</div>
	);
}
