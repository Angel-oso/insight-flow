"use client";

import { useMutation, useQuery } from "convex/react";
import { Link2Off } from "lucide-react";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const minuteMs = 60_000;

function expiresIn(expiresAt: number, now: number) {
	const minutes = Math.max(1, Math.round((expiresAt - now) / minuteMs));
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.round(minutes / 60);
	return hours === 1 ? "1 hour" : `${hours} hours`;
}

/**
 * Pending invitation links for people who manage the team, with revoke.
 * The clock is client-side and rounded to the minute so the subscription
 * is stable (queries never read the wall clock).
 */
export function PendingInvitations({ projectSlug }: { readonly projectSlug: string }) {
	const [now, setNow] = useState(() => Math.floor(Date.now() / minuteMs) * minuteMs);
	useEffect(() => {
		const timer = setInterval(() => setNow(Math.floor(Date.now() / minuteMs) * minuteMs), minuteMs);
		return () => clearInterval(timer);
	}, []);
	const invitations = useQuery(api.invitations.queries.pending, { projectSlug, now });
	const revoke = useMutation(api.invitations.mutations.revoke);
	const [revoking, setRevoking] = useState<Id<"projectInvitations"> | null>(null);

	if (!invitations || invitations.length === 0) return null;
	const target = invitations.find((invitation) => invitation.id === revoking);

	return (
		<Card className="gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="border-b px-5 py-4">
				<h2 className="font-heading text-base font-semibold">Pending invitations</h2>
				<p className="text-sm text-muted-foreground">
					Links and email invitations that have not been used yet. Revoke one sent by mistake.
				</p>
			</CardHeader>
			<CardContent className="divide-y p-0">
				{invitations.map((invitation) => (
					<div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
						<div className="min-w-0 text-sm">
							{invitation.email ? (
								<p className="truncate font-medium">
									{invitation.email} <span className="font-normal capitalize text-muted-foreground">· {invitation.role}</span>
								</p>
							) : (
								<p className="font-medium capitalize">{invitation.role} link</p>
							)}
							<p className="text-xs text-muted-foreground">
								{invitation.email ? "Emailed" : "Created"} by {invitation.createdBy} · expires in {expiresIn(invitation.expiresAt, now)}
							</p>
						</div>
						<Button
							size="sm"
							variant="ghost"
							className="text-destructive hover:text-destructive"
							onClick={() => setRevoking(invitation.id)}
						>
							<Link2Off data-icon="inline-start" />
							Revoke
						</Button>
					</div>
				))}
			</CardContent>
			<ConfirmDialog
				open={target !== undefined}
				onOpenChange={(open) => {
					if (!open) setRevoking(null);
				}}
				title="Revoke this invitation?"
				description={
					target?.email
						? `The invitation emailed to ${target.email} stops working immediately. People who already joined keep their access.`
						: `The ${target?.role ?? ""} invitation link stops working immediately. People who already joined keep their access.`
				}
				confirmLabel="Revoke link"
				pendingLabel="Revoking…"
				onConfirm={async () => {
					if (target) await revoke({ projectSlug, invitationId: target.id });
				}}
			/>
		</Card>
	);
}
