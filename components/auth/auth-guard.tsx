"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { Card, CardHeader } from "@/components/ui/card";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/components/common/confirm-dialog";
import { DeletedOrganizations } from "@/components/workspace/deleted-items";
import { withNext } from "@/lib/safe-next";
import { useSafeNext } from "./use-safe-next";

/**
 * Gate for the authenticated app: anonymous visitors go to /login (with
 * `?next=` set to the page they asked for), and
 * signed-in accounts without any membership land on a server-decided
 * no-workspace screen.
 */
export function RequireAuth({ children }: { readonly children: ReactNode }) {
	const { isLoading, isAuthenticated } = useConvexAuth();
	const router = useRouter();
	const status = useQuery(api.setup.queries.status, isLoading ? "skip" : {});

	useEffect(() => {
		if (isLoading || isAuthenticated) return;
		const { pathname, search, hash } = window.location;
		router.replace(withNext("/login", `${pathname}${search}${hash}`));
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
		return <NoWorkspaceAccess canCreateWorkspace={status.canCreateWorkspace} />;
	}
	return <>{children}</>;
}

function NoWorkspaceAccess({
	canCreateWorkspace,
}: {
	readonly canCreateWorkspace: boolean;
}) {
	const { signOut } = useAuthActions();
	const createWorkspace = useMutation(api.setup.mutations.createWorkspace);
	const router = useRouter();
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [workspaceName, setWorkspaceName] = useState("");
	const [projectName, setProjectName] = useState("");
	const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);

	async function handleSignOut() {
		setIsSigningOut(true);
		try {
			await signOut();
		} finally {
			setIsSigningOut(false);
		}
	}

	async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsCreatingWorkspace(true);
		setCreateError(null);
		try {
			const workspace = await createWorkspace({ name: workspaceName, projectName });
			router.replace(`/projects/${workspace.projectSlug}/home`);
		} catch (cause) {
			setCreateError(errorMessage(cause, "Could not create the workspace. Try again."));
		} finally {
			setIsCreatingWorkspace(false);
		}
	}

	return (
		<div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
			<Card className="w-full">
				<CardHeader className="gap-1 pb-6">
					<LogoMark title="InsightFlow" className="mb-3 size-10" />
					<h1 className="font-heading text-xl font-semibold tracking-[-0.02em]">
						No workspace yet
					</h1>
					<p className="text-sm leading-6 text-muted-foreground">
						{canCreateWorkspace
							? "Create your first workspace to start collecting and managing feedback. You will be its owner and administrator."
							: "Your account is signed in, but it does not belong to a workspace yet. Ask a workspace administrator to invite you."}
					</p>
					{canCreateWorkspace ? (
						<form className="mt-3 grid gap-3" onSubmit={handleCreateWorkspace}>
							<label htmlFor="workspace-name" className="grid gap-2 text-sm font-medium">
								Organization name
								<Input
									id="workspace-name"
									value={workspaceName}
									onChange={(event) => setWorkspaceName(event.target.value)}
									placeholder="e.g. Acme product team"
									autoFocus
									maxLength={80}
									disabled={isCreatingWorkspace}
									required
								/>
							</label>
							<label htmlFor="first-project-name" className="grid gap-2 text-sm font-medium">
								First project name
								<Input id="first-project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Client portal" required maxLength={80} disabled={isCreatingWorkspace} />
							</label>
							{createError ? (
								<p role="alert" className="text-sm text-destructive">
									{createError}
								</p>
							) : null}
							<Button type="submit" disabled={isCreatingWorkspace}>
								{isCreatingWorkspace ? "Creating workspace…" : "Create workspace"}
							</Button>
						</form>
					) : null}
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
			{/* An owner who deleted their only organization can restore it here;
			    restoring brings the membership back and reopens the app. */}
			<DeletedOrganizations />
		</div>
	);
}

/**
 * Gate for /login and /signup: signed-in visitors go to the sanitized
 * `?next=` target, else /home. Every auth flow (password, email code,
 * password reset) finishes here, so they all honor `next`.
 */
export function RedirectIfAuthenticated({
	children,
}: {
	readonly children: ReactNode;
}) {
	const { isLoading, isAuthenticated } = useConvexAuth();
	const router = useRouter();
	const destination = useSafeNext() ?? "/home";

	useEffect(() => {
		if (!isLoading && isAuthenticated) router.replace(destination);
	}, [destination, isLoading, isAuthenticated, router]);

	if (isLoading || isAuthenticated) {
		return (
			<p role="status" className="p-8 text-sm text-muted-foreground">
				Checking your session…
			</p>
		);
	}
	return <>{children}</>;
}
