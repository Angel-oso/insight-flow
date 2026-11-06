"use client";

import { useAction, useQuery } from "convex/react";
import { Copy, Link2, Mail, UserPlus } from "lucide-react";
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
import { userFacingError } from "@/lib/errors";
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
	const sendInvitation = useAction(api.invitations.actions.sendByEmail);
	const [mode, setMode] = useState<"link" | "email">("link");
	const [email, setEmail] = useState("");
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [roleId, setRoleId] = useState<Id<"roles"> | "">("");
	const [expiresInHours, setExpiresInHours] = useState<1 | 6 | 24>(24);
	const [link, setLink] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [copied, setCopied] = useState(false);
	const canInvite = access?.permissions.includes("team.manage") ?? false;
	// Member caps and the verified-email rule, known before the form is sent.
	const status = useQuery(api.invitations.queries.inviteStatus, canInvite ? { projectSlug } : "skip");
	const blocked = status?.message ?? (mode === "email" && status && !status.canEmail
		? "Verify your email address before sending invitations by email. You can still share a link."
		: null);

	if (!canInvite) return null;

	function openDialog() {
		setLink(null);
		setSentTo(null);
		setEmail("");
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
			if (mode === "email") {
				const sent = await sendInvitation({ projectSlug, roleId, expiresInHours, email });
				setSentTo(sent.email);
			} else {
				const invitation = await createInvitation({ projectSlug, roleId, expiresInHours });
				setLink(`${window.location.origin}/invitations/${invitation.token}`);
			}
		} catch (cause) {
			setError(userFacingError(cause, "Could not create the invitation."));
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
							Share a one-time link yourself or have it emailed to one address. Choose the
							project role and how long the link stays valid.
						</DialogDescription>
					</DialogHeader>
					{sentTo ? (
						<div className="space-y-3 px-5 py-1">
							<p role="status" className="text-sm">
								Invitation sent to <span className="font-medium">{sentTo}</span>.
							</p>
							<p className="text-sm text-muted-foreground">
								The link in the email works once and expires in{" "}
								{expiryOptions.find((option) => option.value === expiresInHours)?.label}. It appears
								under pending invitations until it is used, and you can revoke it there.
							</p>
							<DialogFooter>
								<Button type="button" variant="outline" onClick={() => { setSentTo(null); setEmail(""); }}>
									Invite someone else
								</Button>
							</DialogFooter>
						</div>
					) : link ? (
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
								<div role="group" aria-label="How to invite" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
									{([
										["link", "Share a link", Link2],
										["email", "Send by email", Mail],
									] as const).map(([value, label, Icon]) => (
										<Button
											key={value}
											type="button"
											aria-pressed={mode === value}
											variant={mode === value ? "outline" : "ghost"}
											size="sm"
											className={mode === value ? "bg-background" : ""}
											onClick={() => { setMode(value); setError(null); }}
										>
											<Icon data-icon="inline-start" />
											{label}
										</Button>
									))}
								</div>
								{mode === "email" ? (
									<label className="grid gap-2 text-sm font-medium" htmlFor="invite-email">
										Email address
										<Input
											id="invite-email"
											type="email"
											required
											maxLength={254}
											autoComplete="off"
											placeholder="name@company.com"
											value={email}
											onChange={(event) => setEmail(event.target.value)}
										/>
									</label>
								) : null}
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
								{blocked ? <p role="status" className="text-sm text-muted-foreground">{blocked}</p> : null}
								{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
							</div>
							<DialogFooter>
								<Button type="submit" disabled={isCreating || blocked !== null}>
									{mode === "email"
										? isCreating ? "Sending…" : "Send invitation"
										: isCreating ? "Creating link…" : "Create invitation link"}
								</Button>
							</DialogFooter>
						</form>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
