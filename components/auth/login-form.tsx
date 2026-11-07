"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CAPTCHA_REQUIRED, useAuthCaptcha, type CaptchaParams } from "./auth-captcha";
import { authErrorMessage, EMAIL_PATTERN, normalizeEmail } from "./auth-errors";
import { EmailCodeStep, FormAlert } from "./email-code-step";
import { GoogleMark } from "./google-mark";
import { PasswordResetForm } from "./password-reset-form";
import { useSafeNext } from "./use-safe-next";

type Errors = { email?: string; password?: string; form?: string };

function validate(email: string, password: string): Errors {
	const errors: Errors = {};
	if (!EMAIL_PATTERN.test(email.trim())) {
		errors.email = "Enter a valid email address, like you@studio.com.";
	}
	if (password.length < 8) {
		errors.password = "Password needs at least 8 characters.";
	}
	return errors;
}

export function LoginForm() {
	const { signIn } = useAuthActions();
	const { isAuthenticated } = useConvexAuth();
	const [showPassword, setShowPassword] = useState(false);
	const [errors, setErrors] = useState<Errors>({});
	const [busy, setBusy] = useState<"idle" | "google" | "password">("idle");
	// "verify": the account's email isn't verified yet, so sign-in sent a code.
	const [mode, setMode] = useState<"signIn" | "verify" | "reset">("signIn");
	// The password is kept only while the code step needs it (the code
	// counts together with the password); it is cleared on success or back.
	const [credentials, setCredentials] = useState({ email: "", password: "" });
	const safeNext = useSafeNext();
	// The server asks for a captcha only after a failed sign-in for the
	// address (or when signing in to an unverified account emails a code), so
	// the widget appears once the server has refused without one.
	const captcha = useAuthCaptcha();
	const [captchaNeeded, setCaptchaNeeded] = useState(false);

	useEffect(() => {
		if (busy === "idle" || isAuthenticated) return;

		const timeout = window.setTimeout(() => {
			setBusy("idle");
			setErrors({
				form: "Sign-in did not finish. Check your connection and try again.",
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
				setErrors({ form: "Google sign-in did not start. Try again." });
			}
		} catch (error) {
			setBusy("idle");
			setErrors({ form: authErrorMessage(error, "google") });
		}
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const email = normalizeEmail(String(data.get("email") ?? ""));
		const password = String(data.get("password") ?? "");
		setCredentials({ email, password: "" });
		const next = validate(email, password);
		setErrors(next);
		if (Object.keys(next).length > 0) return;
		if (captchaNeeded && !captcha.ready) {
			setErrors({ form: CAPTCHA_REQUIRED });
			return;
		}

		setBusy("password");
		try {
			const result = await signIn("password", {
				email,
				password,
				flow: "signIn",
				...(captchaNeeded ? captcha.take() : {}),
			});
			if (!result.signingIn) {
				// Correct password, unverified email: Convex Auth emailed a code.
				setCredentials({ email, password });
				setBusy("idle");
				setMode("verify");
			}
		} catch (error) {
			setBusy("idle");
			// After any failure the server wants a captcha for this address.
			setCaptchaNeeded(true);
			const message = authErrorMessage(error, "signIn");
			setErrors({ form: /human/i.test(message) && !captchaNeeded ? CAPTCHA_REQUIRED : message });
		}
	}

	async function verifyCode(code: string, captchaParams: CaptchaParams) {
		try {
			const result = await signIn("password", {
				email: credentials.email,
				// The code only counts together with the account's password.
				password: credentials.password,
				code,
				flow: "email-verification",
				...captchaParams,
			});
			if (!result.signingIn) throw new Error(authErrorMessage(null, "verify"));
			setCredentials((current) => ({ ...current, password: "" }));
			return true;
		} catch (error) {
			throw new Error(authErrorMessage(error, "verify"));
		}
	}

	async function resendCode(captchaParams: CaptchaParams) {
		try {
			await signIn("password", { ...credentials, flow: "signIn", ...captchaParams });
		} catch (error) {
			throw new Error(authErrorMessage(error, "signIn"));
		}
	}

	function backToSignIn() {
		setErrors({});
		setBusy("idle");
		setCredentials((current) => ({ ...current, password: "" }));
		setMode("signIn");
	}

	if (mode === "verify") {
		return (
			<EmailCodeStep
				email={credentials.email}
				onVerify={verifyCode}
				onResend={resendCode}
				onBack={backToSignIn}
				backLabel="Back to sign in"
			/>
		);
	}

	if (mode === "reset") {
		return <PasswordResetForm initialEmail={credentials.email} onBack={backToSignIn} />;
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
				<span>or continue with email</span>
				<span className="h-px flex-1 bg-border" />
			</div>

			<form onSubmit={handleSubmit} noValidate className="space-y-4">
				{errors.form ? <FormAlert>{errors.form}</FormAlert> : null}

				<div className="space-y-1.5">
					<label htmlFor="login-email" className="text-sm font-medium">
						Work email
					</label>
					<Input
						id="login-email"
						name="email"
						type="email"
						autoComplete="email"
						placeholder="you@studio.com"
						defaultValue={credentials.email}
						aria-invalid={Boolean(errors.email)}
						aria-describedby={errors.email ? "login-email-error" : undefined}
					/>
					{errors.email ? (
						<p id="login-email-error" role="alert" className="text-xs text-destructive">
							{errors.email}
						</p>
					) : null}
				</div>

				<div className="space-y-1.5">
					<div className="flex items-baseline justify-between">
						<label htmlFor="login-password" className="text-sm font-medium">
							Password
						</label>
						<button
							type="button"
							onClick={(event) => {
								const field = event.currentTarget.form?.elements.namedItem("email");
								const typed = field instanceof HTMLInputElement ? field.value : "";
								setCredentials({ email: normalizeEmail(typed), password: "" });
								setErrors({});
								setMode("reset");
							}}
							disabled={busy !== "idle"}
							className="rounded text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
						>
							Forgot password?
						</button>
					</div>
					<div className="relative">
						<Input
							id="login-password"
							name="password"
							type={showPassword ? "text" : "password"}
							autoComplete="current-password"
							placeholder="Your password"
							className="pr-10"
							aria-invalid={Boolean(errors.password)}
							aria-describedby={
								errors.password ? "login-password-error" : undefined
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
							id="login-password-error"
							role="alert"
							className="text-xs text-destructive"
						>
							{errors.password}
						</p>
					) : null}
				</div>

				{captchaNeeded ? captcha.widget : null}

				<Button
					type="submit"
					size="lg"
					className="w-full"
					disabled={busy !== "idle"}
				>
					{busy === "password" ? (
						<>
							<Loader2 className="animate-spin" aria-hidden="true" />
							Signing in…
						</>
					) : (
						"Sign in"
					)}
				</Button>
			</form>
		</div>
	);
}
