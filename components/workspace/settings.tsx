"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrganizationSwitcher } from "./organization-switcher";
import { useOrganization } from "./use-organization";

type Settings = FunctionReturnType<typeof api.organizations.queries.settings>;

export function WorkspaceSettings() {
	const { organization, organizations, loading, setOrganization } = useOrganization();
	if (!organization) return <p role="status" className="p-8 text-sm text-muted-foreground">{loading ? "Loading your organizations…" : "This organization is not available to your account. Return to Workspace to choose your organization."}</p>;
	return <main className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
		<header className="space-y-4 border-b pb-7">
			<Button variant="ghost" nativeButton={false} render={<Link href={`/workspace?organization=${organization.id}`} />}>Back to workspace</Button>
			<h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Organization settings</h1>
			<p className="text-sm text-muted-foreground">Manage the name and ownership of {organization.name}.</p>
			<OrganizationSwitcher organization={organization} organizations={organizations ?? []} onChange={setOrganization} />
		</header>
		{organization.isAdmin ? <AdminSettings key={organization.id} organizationId={organization.id} /> : <p className="mt-7 text-sm text-muted-foreground">Only organization administrators can change these settings.</p>}
	</main>;
}

function AdminSettings({ organizationId }: { readonly organizationId: Id<"organizations"> }) {
	const settings = useQuery(api.organizations.queries.settings, { organizationId });
	if (!settings) return <p role="status" className="mt-7 text-sm text-muted-foreground">Loading organization settings…</p>;
	return <SettingsForms settings={settings} organizationId={organizationId} />;
}

function SettingsForms({ organizationId, settings }: { readonly organizationId: Id<"organizations">; readonly settings: Settings }) {
	const rename = useMutation(api.organizations.mutations.rename);
	const transfer = useMutation(api.organizations.mutations.transferOwnership);
	const [name, setName] = useState(settings.name);
	const [targetId, setTargetId] = useState("");
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [renameMessage, setRenameMessage] = useState<string | null>(null);
	const [renameError, setRenameError] = useState<string | null>(null);
	const [transferError, setTransferError] = useState<string | null>(null);
	const [transferred, setTransferred] = useState(false);
	const candidates = settings.eligibleAdmins.filter((admin) => admin.id !== settings.ownerId);
	const target = candidates.find((admin) => admin.id === targetId);
	async function saveName(event: FormEvent) {
		event.preventDefault();
		setBusy(true); setRenameError(null); setRenameMessage(null);
		try {
			await rename({ organizationId, name });
			setRenameMessage("Organization name saved.");
		} catch (cause) {
			setRenameError(cause instanceof ConvexError ? cause.message : "Could not save the name. Try again.");
		} finally { setBusy(false); }
	}
	async function confirmTransfer() {
		if (!target) return;
		setBusy(true); setTransferError(null);
		try {
			await transfer({ organizationId, userId: target.id });
			setConfirmOpen(false); setTargetId(""); setTransferred(true);
		} catch (cause) {
			setTransferError(cause instanceof ConvexError ? cause.message : "Could not transfer ownership. Try again.");
		} finally { setBusy(false); }
	}
	return <div className="mt-7 max-w-2xl space-y-6">
		<Card className="gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="border-b px-5 py-5"><h2 className="font-heading text-lg font-semibold">Organization name</h2><p className="text-sm text-muted-foreground">The display name changes; existing project links stay the same.</p></CardHeader>
			<CardContent className="p-5"><form className="space-y-4" onSubmit={saveName}>
				<label className="grid gap-2 text-sm font-medium">Organization name<Input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} /></label>
				{renameError && <p role="alert" className="text-sm text-destructive">{renameError}</p>}
				{renameMessage && <p role="status" className="text-sm text-dashboard-success">{renameMessage}</p>}
				<Button type="submit" disabled={busy || !name.trim() || name.trim() === settings.name}>{busy ? "Saving…" : "Save organization name"}</Button>
			</form></CardContent>
		</Card>
		<Card className="gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="border-b px-5 py-5"><h2 className="font-heading text-lg font-semibold">Ownership</h2><p className="text-sm text-muted-foreground">Current owner: <span className="font-medium text-foreground">{settings.ownerName}</span>{settings.isOwner ? " (you)" : ""}</p></CardHeader>
			<CardContent className="space-y-4 p-5">
				{transferred && <p role="status" className="text-sm text-dashboard-success">Ownership transferred. Your administrator access is unchanged.</p>}
				{settings.isOwner ? <>
					<p className="text-sm leading-6 text-muted-foreground">Transfer ownership to another organization administrator. You keep administrator access, but only the new owner can transfer ownership again.</p>
					{candidates.length ? <>
						<div className="grid gap-2 text-sm font-medium">
							<label htmlFor="new-owner">New owner</label>
							<Select
								items={candidates.map((admin) => ({ value: admin.id, label: admin.name }))}
								value={targetId || null}
								disabled={busy}
								onValueChange={(value) => setTargetId(value ?? "")}
							>
								<SelectTrigger id="new-owner" className="h-9 w-full">
									<SelectValue placeholder="Choose an administrator" />
								</SelectTrigger>
								<SelectContent>
									{candidates.map((admin) => (
										<SelectItem key={admin.id} value={admin.id}>{admin.name}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button variant="outline" disabled={!target || busy} onClick={() => { setTransferError(null); setConfirmOpen(true); }}>Transfer ownership</Button>
					</> : <p className="text-sm text-muted-foreground">There are no other eligible organization administrators yet.</p>}
				</> : <p className="text-sm text-muted-foreground">Only the current owner can transfer ownership.</p>}
			</CardContent>
		</Card>
		<Dialog open={confirmOpen} onOpenChange={(open) => { if (!busy) setConfirmOpen(open); }}>
			<DialogContent><DialogHeader><DialogTitle>Transfer organization ownership?</DialogTitle><DialogDescription>{target?.name} will become the owner of {settings.name}. Only they will be able to transfer ownership again.</DialogDescription></DialogHeader>
				{transferError && <p role="alert" className="px-5 text-sm text-destructive">{transferError}</p>}
				<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirmOpen(false)}>Cancel</Button><Button disabled={busy || !target} onClick={() => void confirmTransfer()}>{busy ? "Transferring…" : "Confirm transfer"}</Button></DialogFooter>
			</DialogContent>
		</Dialog>
	</div>;
}
