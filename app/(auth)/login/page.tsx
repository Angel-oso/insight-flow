import type { Metadata } from "next";
import { AuthCard, AuthSwitchLink } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
	title: "Sign in — InsightFlow",
	description: "Sign in to your InsightFlow workspace.",
};

export default function LoginPage() {
	return (
		<AuthCard
			title="Welcome back"
			description="Sign in to pick up triage, assignments and project health where you left them."
			footer={
				<AuthSwitchLink
					href="/signup"
					action="New to InsightFlow?"
					label="Create an account"
				/>
			}
		>
			<LoginForm />
		</AuthCard>
	);
}
