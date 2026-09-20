"use client";

import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Gate for the authenticated app: anonymous visitors go to /login, and
 * signed-in accounts without any membership land on a server-decided
 * no-workspace screen.
 */
export function RequireAuth({ children }: { readonly children: ReactNode }) {
	const { isLoading, isAuthenticated } = useConvexAuth();
	const router = useRouter();
	const status = useQuery(api.setup.queries.status, isLoading ? "skip" : {});

	useEffect(() => {
		if (!isLoading && !isAuthenticated) router.replace("/login");
	}, [isLoading, isAuthenticated, router]);

	if (isLoading || !isAuthenticated) {
		return (
			<p role="status" className="p-8 text-sm text-muted-foreground">
				Checking your session…
			</p>
		);
	}
	if (status === undefined) {
		return (
			<p role="status" className="p-8 text-sm text-muted-foreground">
				Checking your workspace access…
			</p>
		);
	}
	if (!status.hasMembership) {
		return <NoWorkspaceAccess />;
	}
	return <>{children}</>;
}

function NoWorkspaceAccess() {
	const { signOut } = useAuthActions();
	const [isSigningOut, setIsSigningOut] = useState(false);

	async function handleSignOut() {
		setIsSigningOut(true);
		try {
			await signOut();
		} finally {
			setIsSigningOut(false);
		}
	}

	return (
		<div className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-10">
			<Card className="w-full">
				<CardHeader className="gap-1 pb-6">
					<h1 className="font-heading text-xl font-semibold tracking-[-0.02em]">
						No workspace yet
					</h1>
					<p className="text-sm leading-6 text-muted-foreground">
						Your account is signed in, but it does not belong to a workspace yet. Ask a workspace administrator to invite you.
					</p>
					<Button
						type="button"
						variant="outline"
						className="mt-3 w-full"
						disabled={isSigningOut}
						onClick={handleSignOut}
					>
						{isSigningOut ? "Signing out…" : "Sign out"}
					</Button>
				</CardHeader>
			</Card>
		</div>
	);
}

/** Gate for /login and /signup: signed-in visitors go straight to /home. */
export function RedirectIfAuthenticated({
	children,
}: {
	readonly children: ReactNode;
}) {
	const { isLoading, isAuthenticated } = useConvexAuth();
	const router = useRouter();

	useEffect(() => {
		if (!isLoading && isAuthenticated) router.replace("/home");
	}, [isLoading, isAuthenticated, router]);

	if (isLoading || isAuthenticated) {
		return (
			<p role="status" className="p-8 text-sm text-muted-foreground">
				Checking your session…
			</p>
		);
	}
	return <>{children}</>;
}
