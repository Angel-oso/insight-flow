"use client";

import { useAction, useQuery } from "convex/react";
import { Copy, Link2, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const expiryOptions = [
	{ value: 1, label: "1 hour" },
	{ value: 6, label: "6 hours" },
	{ value: 24, label: "1 day" },
] as const;

export function ProjectInvitations({ projectSlug }: { readonly projectSlug: string }) {
	const access = useQuery(api.projects.settings.access, { projectSlug });
	const roleSettings = useQuery(api.projects.settings.roles, { projectSlug });
	const createInvitation = useAction(api.invitations.actions.create);
	const [isOpen, setIsOpen] = useState(false);
	const [roleId, setRoleId] = useState<Id<"roles"> | "">("");
	const [expiresInHours, setExpiresInHours] = useState<1 | 6 | 24>(24);
	const [link, setLink] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [copied, setCopied] = useState(false);
	const canInvite = access?.permissions.includes("team.manage") ?? false;

	if (!canInvite) return null;

	function openDialog() {
		setLink(null);
		setError(null);
		setCopied(false);
		setRoleId((current) => current || roleSettings?.roles.find((role) => role.name === "member")?.id || "");
		setIsOpen(true);
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsCreating(true);
		setError(null);
		try {
			if (!roleId) throw new Error("Choose a role for this invitation.");
			const invitation = await createInvitation({ projectSlug, roleId, expiresInHours });
			setLink(`${window.location.origin}/invitations/${invitation.token}`);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not create the invitation.");
		} finally {
			setIsCreating(false);
		}
	}

	async function copyLink() {
		if (!link) return;
		await navigator.clipboard.writeText(link);
		setCopied(true);
	}

	return (
		<>
			<Button type="button" variant="outline" onClick={openDialog}>
				<UserPlus />
				Invite member
			</Button>
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Invite to project</DialogTitle>
						<DialogDescription>
							Choose the project role and how long the link should remain valid.
						</DialogDescription>
					</DialogHeader>
					{link ? (
						<div className="space-y-3 px-5 py-1">
							<p className="text-sm text-muted-foreground">
								Anyone who opens this one-time link must sign in before accepting it.
							</p>
							<div className="flex gap-2">
								<Input value={link} readOnly aria-label="Invitation link" />
								<Button type="button" variant="outline" size="icon" onClick={copyLink}>
									{copied ? <Copy className="text-primary" /> : <Link2 />}
									<span className="sr-only">Copy invitation link</span>
								</Button>
							</div>
						</div>
					) : (
						<form onSubmit={handleSubmit} className="space-y-4">
							<div className="space-y-4 px-5 py-1">
								<label className="grid gap-2 text-sm font-medium" htmlFor="invite-role">
									Role
									<Select
										items={(roleSettings?.roles ?? []).map((role) => ({ value: role.id, label: role.name }))}
										value={roleId || null}
										onValueChange={(value) => value && setRoleId(value as Id<"roles">)}
									>
										<SelectTrigger id="invite-role" className="w-full capitalize">
											<SelectValue placeholder="Choose a role" />
										</SelectTrigger>
										<SelectContent>
											{roleSettings?.roles.map((role) => (
												<SelectItem key={role.id} value={role.id} className="capitalize">
													{role.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</label>
								<label className="grid gap-2 text-sm font-medium" htmlFor="invite-expiry">
									Link expires in
									<Select
										items={expiryOptions}
										value={expiresInHours}
										onValueChange={(value) => value && setExpiresInHours(value)}
									>
										<SelectTrigger id="invite-expiry" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{expiryOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</label>
								{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
							</div>
							<DialogFooter>
								<Button type="submit" disabled={isCreating}>
									{isCreating ? "Creating link…" : "Create invitation link"}
								</Button>
							</DialogFooter>
						</form>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
