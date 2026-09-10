import type { Metadata } from "next";
import { AuthCard, AuthSwitchLink } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
	title: "Create account — InsightFlow",
	description: "Create your InsightFlow account and set up your first workspace.",
};

export default function SignupPage() {
	return (
		<AuthCard
			title="Create your account"
			description="Set up your workspace, create your first project and share its feedback link."
			footer={
				<AuthSwitchLink
					href="/login"
					action="Already have an account?"
					label="Sign in"
				/>
			}
		>
			<SignupForm />
		</AuthCard>
	);
}
