"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleMark } from "./google-mark";

type Errors = { name?: string; email?: string; password?: string; form?: string };

function validate(name: string, email: string, password: string): Errors {
	const errors: Errors = {};
	if (name.trim().length < 2) {
		errors.name = "Tell us your name — at least 2 characters.";
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
		errors.email = "Enter a valid email address, like you@studio.com.";
	}
	if (password.length < 8 || password.length > 128) {
		errors.password = "Choose a password between 8 and 128 characters.";
	}
	return errors;
}

export function SignupForm() {
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
						: "Google sign-up failed. Try again.",
			});
		}
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const name = String(data.get("name") ?? "").trim();
		const email = String(data.get("email") ?? "").trim();
		const password = String(data.get("password") ?? "");
		const next = validate(name, email, password);
		setErrors(next);
		if (Object.keys(next).length > 0) return;

		setBusy("password");
		try {
			await signIn("password", { name, email, password, flow: "signUp" });
		} catch (error) {
			setBusy("idle");
			setErrors({
				form:
					error instanceof Error
						? error.message
						: "Account creation failed. Try again.",
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
				<span>or create an account with email</span>
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
					By continuing you agree to the Terms and Privacy Policy. They will
					link out once legal copy is ready.
				</p>
			</form>
		</div>
	);
}
