"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CAPTCHA_REQUIRED, useAuthCaptcha } from "./auth-captcha";
import { authErrorMessage, EMAIL_PATTERN, normalizeEmail } from "./auth-errors";
import {
	CodeInput,
	FormAlert,
	FormNotice,
	ResendCodeButton,
	useResendCooldown,
} from "./email-code-step";

type Errors = { email?: string; code?: string; password?: string; form?: string };

/**
 * Forgot-password flow: request a code ("reset"), then enter the code with a
 * new password ("reset-verification"), which also signs the user in. The
 * request step never reveals whether an account exists for the address.
 */
export function PasswordResetForm({
	initialEmail,
	onBack,
}: {
	readonly initialEmail: string;
	readonly onBack: () => void;
}) {
	const { signIn } = useAuthActions();
	const [step, setStep] = useState<"request" | "verify">("request");
	const [email, setEmail] = useState(initialEmail);
	const [code, setCode] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [errors, setErrors] = useState<Errors>({});
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState<"idle" | "request" | "reset" | "resend">("idle");
	const cooldown = useResendCooldown();
	const captcha = useAuthCaptcha();
	// After a wrong code the server wants a captcha with every reset attempt.
	const [captchaNeeded, setCaptchaNeeded] = useState(false);

	/**
	 * Throws only for failures that don't depend on whether the account
	 * exists: the human check and connectivity. Everything else (unknown
	 * address, delivery limits, delivery errors, which only happen for real
	 * accounts) gets the same "if an account exists" outcome as success, so
	 * the form can't be used to discover which emails have accounts. The
	 * server answers the same way for all of those too.
	 */
	async function requestCode(address: string) {
		if (!captcha.ready) throw new ConvexError(CAPTCHA_REQUIRED);
		try {
			await signIn("password", { email: address, flow: "reset", ...captcha.take() });
		} catch (error) {
			const message =
				error instanceof ConvexError && typeof error.data === "string"
					? error.data
					: error instanceof Error
						? error.message
						: "";
			if (/human|temporarily unavailable|Failed to fetch|NetworkError|network/i.test(message)) {
				throw error;
			}
		}
	}

	async function handleRequest(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const address = normalizeEmail(email);
		if (!EMAIL_PATTERN.test(address)) {
			setErrors({ email: "Enter a valid email address, like you@studio.com." });
			return;
		}
		setErrors({});
		setBusy("request");
		try {
			await requestCode(address);
			setEmail(address);
			setStep("verify");
			setNotice(null);
			cooldown.restart();
		} catch (error) {
			setErrors({ form: authErrorMessage(error, "reset") });
		} finally {
			setBusy("idle");
		}
	}

	async function handleResend() {
		setErrors({});
		setNotice(null);
		setBusy("resend");
		try {
			await requestCode(email);
			setCode("");
			setNotice(`If an account exists for ${email}, we sent a new code.`);
			cooldown.restart();
		} catch (error) {
			setErrors({ form: authErrorMessage(error, "reset") });
		} finally {
			setBusy("idle");
		}
	}

	async function handleReset(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const next: Errors = {};
		if (code.length !== 8) next.code = "Enter the 8-digit code from the email.";
		if (password.length < 8 || password.length > 128)
			next.password = "Choose a password between 8 and 128 characters.";
		else if (password !== confirm) next.password = "The passwords do not match.";
		if (Object.keys(next).length === 0 && captchaNeeded && !captcha.ready)
			next.form = CAPTCHA_REQUIRED;
		setErrors(next);
		setNotice(null);
		if (Object.keys(next).length > 0) return;

		setBusy("reset");
		try {
			const result = await signIn("password", {
				email,
				code,
				newPassword: password,
				flow: "reset-verification",
				...(captchaNeeded ? captcha.take() : {}),
			});
			if (!result.signingIn) {
				setBusy("idle");
				setCaptchaNeeded(true);
				setErrors({ form: authErrorMessage(null, "reset-verification") });
				return;
			}
			// Signed in: the auth layout redirects into the app. The new
			// password no longer needs to live in this component.
			setPassword("");
			setConfirm("");
		} catch (error) {
			setBusy("idle");
			setCaptchaNeeded(true);
			setErrors({ form: authErrorMessage(error, "reset-verification") });
		}
	}

	if (step === "request") {
		return (
			<form onSubmit={handleRequest} noValidate className="space-y-4">
				<div>
					<p className="text-sm font-medium">Reset your password</p>
					<p className="mt-1 text-sm leading-6 text-muted-foreground">
						Enter the email you sign in with and we&apos;ll send you an 8-digit
						code to choose a new password.
					</p>
				</div>
				{errors.form ? <FormAlert>{errors.form}</FormAlert> : null}
				<div className="space-y-1.5">
					<label htmlFor="reset-email" className="text-sm font-medium">
						Work email
					</label>
					<Input
						id="reset-email"
						name="email"
						type="email"
						autoComplete="email"
						placeholder="you@studio.com"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						aria-invalid={Boolean(errors.email)}
						aria-describedby={errors.email ? "reset-email-error" : undefined}
						autoFocus
					/>
					{errors.email ? (
						<p id="reset-email-error" role="alert" className="text-xs text-destructive">
							{errors.email}
						</p>
					) : null}
				</div>
				{captcha.widget}
				<Button type="submit" size="lg" className="w-full" disabled={busy !== "idle"}>
					{busy === "request" ? (
						<>
							<Loader2 className="animate-spin" aria-hidden="true" />
							Sending code…
						</>
					) : (
						"Send reset code"
					)}
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={onBack}>
					<ArrowLeft aria-hidden="true" />
					Back to sign in
				</Button>
			</form>
		);
	}

	return (
		<form onSubmit={handleReset} noValidate className="space-y-4">
			<div>
				<p className="text-sm font-medium">Choose a new password</p>
				<p className="mt-1 text-sm leading-6 text-muted-foreground">
					If an account exists for{" "}
					<span className="font-medium break-all text-foreground">{email}</span>, we
					sent it an 8-digit code. It expires in 15 minutes.
				</p>
			</div>
			{errors.form ? <FormAlert>{errors.form}</FormAlert> : null}
			{notice ? <FormNotice>{notice}</FormNotice> : null}

			<CodeInput
				id="reset-code"
				value={code}
				onChange={setCode}
				error={errors.code}
				disabled={busy === "reset"}
			/>

			<div className="space-y-1.5">
				<label htmlFor="reset-password" className="text-sm font-medium">
					New password
				</label>
				<div className="relative">
					<Input
						id="reset-password"
						name="newPassword"
						type={showPassword ? "text" : "password"}
						autoComplete="new-password"
						placeholder="8+ characters"
						className="pr-10"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						aria-invalid={Boolean(errors.password)}
						aria-describedby={errors.password ? "reset-password-error" : undefined}
					/>
					<button
						type="button"
						onClick={() => setShowPassword((value) => !value)}
						aria-label={showPassword ? "Hide password" : "Show password"}
						aria-pressed={showPassword}
						className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
					>
						{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
					</button>
				</div>
			</div>
			<div className="space-y-1.5">
				<label htmlFor="reset-confirm" className="text-sm font-medium">
					Confirm new password
				</label>
				<Input
					id="reset-confirm"
					name="confirmPassword"
					type={showPassword ? "text" : "password"}
					autoComplete="new-password"
					value={confirm}
					onChange={(event) => setConfirm(event.target.value)}
					aria-invalid={Boolean(errors.password)}
					aria-describedby={errors.password ? "reset-password-error" : undefined}
				/>
				{errors.password ? (
					<p id="reset-password-error" role="alert" className="text-xs text-destructive">
						{errors.password}
					</p>
				) : (
					<p className="text-xs text-muted-foreground">
						Other signed-in sessions are signed out after the reset.
					</p>
				)}
			</div>

			<Button type="submit" size="lg" className="w-full" disabled={busy !== "idle"}>
				{busy === "reset" ? (
					<>
						<Loader2 className="animate-spin" aria-hidden="true" />
						Resetting password…
					</>
				) : (
					"Reset password and sign in"
				)}
			</Button>
			{captcha.widget}
			<div className="flex items-center justify-between gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={busy === "reset"}
					onClick={() => {
						setStep("request");
						setErrors({});
						setNotice(null);
						setCode("");
						setPassword("");
						setConfirm("");
					}}
				>
					<ArrowLeft aria-hidden="true" />
					Use a different email
				</Button>
				<ResendCodeButton
					seconds={cooldown.seconds}
					busy={busy === "resend"}
					onResend={() => void handleResend()}
				/>
			</div>
		</form>
	);
}
