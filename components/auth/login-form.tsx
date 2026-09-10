"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleMark } from "./google-mark";

type Errors = { email?: string; password?: string; form?: string };

function validate(email: string, password: string): Errors {
	const errors: Errors = {};
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
		errors.email = "Enter a valid email address, like you@studio.com.";
	}
	if (password.length < 8) {
		errors.password = "Password needs at least 8 characters.";
	}
	return errors;
}

export function LoginForm() {
	const { signIn } = useAuthActions();
	const [showPassword, setShowPassword] = useState(false);
	const [errors, setErrors] = useState<Errors>({});
	const [busy, setBusy] = useState<"idle" | "google" | "password">("idle");

	async function handleGoogle() {
		setErrors({});
		setBusy("google");
		try {
			await signIn("google");
		} catch (error) {
			setBusy("idle");
			setErrors({
				form:
					error instanceof Error
						? error.message
						: "Google sign-in failed. Try again.",
			});
		}
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const email = String(data.get("email") ?? "").trim();
		const password = String(data.get("password") ?? "");
		const next = validate(email, password);
		setErrors(next);
		if (Object.keys(next).length > 0) return;

		setBusy("password");
		try {
			await signIn("password", { email, password, flow: "signIn" });
		} catch (error) {
			setBusy("idle");
			setErrors({
				form:
					error instanceof Error
						? error.message
						: "Sign-in failed. Check your details and try again.",
			});
		}
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
				{errors.form ? (
					<p
						role="alert"
						className="rounded-lg bg-destructive/10 px-3 py-2.5 text-xs leading-5 text-destructive"
					>
						{errors.form}
					</p>
				) : null}

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
						<span className="text-xs text-muted-foreground">
							Password reset arrives with email verification.
						</span>
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
