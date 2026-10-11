"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { LogoMark } from "@/components/brand/logo";
import { projectPath } from "@/lib/projects";

export function AcceptInvitation({ token }: { readonly token: string }) {
	const router = useRouter();
	const { isLoading, isAuthenticated } = useConvexAuth();
	const invitation = useQuery(
		api.invitations.queries.preview,
		isAuthenticated ? { token } : "skip",
	);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 30000);
		return () => clearInterval(timer);
	}, []);
	const accept = useMutation(api.invitations.mutations.accept);
	const [isAccepting, setIsAccepting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.replace(`/login?next=${encodeURIComponent(`/invitations/${token}`)}`);
		}
	}, [isAuthenticated, isLoading, router, token]);

	async function acceptInvitation() {
		setIsAccepting(true);
		setError(null);
		try {
			const result = await accept({ token });
			router.replace(projectPath(result.projectSlug, "home"));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not accept this invitation.");
			setIsAccepting(false);
		}
	}

	if (!isLoading && !isAuthenticated) {
		return <p role="status" className="p-8 text-sm text-muted-foreground">Redirecting to sign in…</p>;
	}
	if (isLoading || invitation === undefined) {
		return <p role="status" className="p-8 text-sm text-muted-foreground">Checking invitation…</p>;
	}

	if (!invitation) {
		return (
			<InvitationCard title="Invitation unavailable">
				<p className="text-sm text-muted-foreground">This invitation link is invalid.</p>
			</InvitationCard>
		);
	}
	const expired = invitation.status === "pending" && invitation.expiresAt <= now;
	if (invitation.status === "accepted" || expired) {
		return (
			<InvitationCard title="Invitation unavailable">
				<p className="text-sm text-muted-foreground">
					{invitation.status === "accepted"
						? "This invitation link has already been used."
						: "This invitation link has expired."}
				</p>
			</InvitationCard>
		);
	}

	return (
		<InvitationCard title="Join project">
			<p className="text-sm leading-6 text-muted-foreground">
				You have been invited to join <span className="font-medium text-foreground">{invitation.projectName}</span> as a {invitation.role}.
			</p>
			<p className="text-xs text-muted-foreground">
				This link expires {new Date(invitation.expiresAt).toLocaleString()}.
			</p>
			{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
			<Button type="button" onClick={acceptInvitation} disabled={isAccepting}>
				{isAccepting ? "Joining project…" : "Accept invitation"}
			</Button>
		</InvitationCard>
	);
}

function InvitationCard({ title, children }: { readonly title: string; readonly children: ReactNode }) {
	return (
		<div className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-10">
			<Card className="w-full">
				<CardHeader>
					<LogoMark title="InsightFlow" className="mb-3 size-10" />
					<h1 className="font-heading text-xl font-semibold tracking-[-0.02em]">{title}</h1>
				</CardHeader>
				<CardContent className="space-y-4">{children}</CardContent>
			</Card>
		</div>
	);
}
