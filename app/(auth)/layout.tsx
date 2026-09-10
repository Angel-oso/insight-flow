import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { RedirectIfAuthenticated } from "@/components/auth/auth-guard";

export default function AuthLayout({
	children,
}: {
	readonly children: ReactNode;
}) {
	return (
		<AuthShell>
			<RedirectIfAuthenticated>{children}</RedirectIfAuthenticated>
		</AuthShell>
	);
}
