"use client";

import { useMutation, useQuery } from "convex/react";
import { LogOut, Trash2, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog, errorMessage } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const cardClass = "gap-0 rounded-xl py-0 shadow-none ring-foreground/8";

const organizationRoles = [
	{ value: "admin", label: "Admin" },
	{ value: "manager", label: "Manager" },
	{ value: "member", label: "Member" },
] as const;
type OrganizationRole = (typeof organizationRoles)[number]["value"];

function roleStyle(role: string) {
	if (role === "admin") return "bg-dashboard-primary-soft text-dashboard-primary";
	if (role === "manager") return "bg-dashboard-info-soft text-dashboard-info";
	return "bg-muted text-muted-foreground";
}

/** Organization roster with role changes and removal, for organization administrators. */
export function OrganizationMembers({ organizationId }: { readonly organizationId: Id<"organizations"> }) {
	const members = useQuery(api.organizations.members.list, { organizationId });
	const remove = useMutation(api.organizations.members.removeMember);
	const setRole = useMutation(api.organizations.members.setRole);
	const [removingId, setRemovingId] = useState<Id<"users"> | null>(null);
	const [savingId, setSavingId] = useState<Id<"users"> | null>(null);
	const [roleError, setRoleError] = useState<string | null>(null);
	const target = members?.find((member) => member.id === removingId);

	async function changeRole(userId: Id<"users">, role: OrganizationRole) {
		setSavingId(userId);
		setRoleError(null);
		try {
			await setRole({ organizationId, userId, role });
		} catch (cause) {
			setRoleError(errorMessage(cause, "Could not change this role. Try again."));
		} finally {
			setSavingId(null);
		}
	}

	return (
		<Card className={cardClass}>
			<CardHeader className="border-b px-5 py-5">
				<h2 className="font-heading text-lg font-semibold">Members</h2>
				<p className="text-sm text-muted-foreground">
					Everyone with access to this organization. Admins manage the whole organization and
					can become its owner. Removing someone takes them out of every project here; their
					open feedback returns to the unassigned queue.
				</p>
			</CardHeader>
			{roleError ? <p role="alert" className="border-b px-5 py-3 text-sm text-destructive">{roleError}</p> : null}
			<CardContent className="divide-y p-0">
				{members === undefined ? (
					<p role="status" className="px-5 py-4 text-sm text-muted-foreground">Loading members…</p>
				) : (
					members.map((member) => (
						<div key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">
									{member.name}
									{member.isYou ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
								</p>
								<p className="truncate text-xs text-muted-foreground">{member.email || "No email address"}</p>
							</div>
							<div className="flex items-center gap-2">
								{member.isOwner ? (
									<span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${roleStyle("admin")}`}>
										owner
									</span>
								) : (
									<Select
										items={organizationRoles.map((role) => ({ value: role.value, label: role.label }))}
										value={member.role}
										disabled={savingId !== null || member.isYou}
										onValueChange={(value) => {
											if (value && value !== member.role) void changeRole(member.id, value as OrganizationRole);
										}}
									>
										<SelectTrigger
											className="h-8 w-32"
											aria-label={`Organization role for ${member.name}`}
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{organizationRoles.map((role) => (
												<SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
								{!member.isOwner && !member.isYou ? (
									<Button
										size="sm"
										variant="ghost"
										aria-label={`Remove ${member.name} from this organization`}
										onClick={() => setRemovingId(member.id)}
									>
										<UserMinus data-icon="inline-start" />
										Remove
									</Button>
								) : null}
							</div>
						</div>
					))
				)}
			</CardContent>
			<ConfirmDialog
				open={target !== undefined}
				onOpenChange={(open) => {
					if (!open) setRemovingId(null);
				}}
				title={`Remove ${target?.name ?? "this member"}?`}
				description="They lose access to every project in this organization. Their open feedback returns to the unassigned queue; notes and history stay."
				confirmLabel="Remove member"
				pendingLabel="Removing…"
				onConfirm={async () => {
					if (target) await remove({ organizationId, userId: target.id });
				}}
			/>
		</Card>
	);
}

/** "Leave organization" for any member who is not the owner. */
export function LeaveOrganization({
	organizationId,
	organizationName,
	isOwner,
}: {
	readonly organizationId: Id<"organizations">;
	readonly organizationName: string;
	readonly isOwner: boolean;
}) {
	const router = useRouter();
	const leave = useMutation(api.organizations.members.leave);
	const [open, setOpen] = useState(false);
	return (
		<Card className={cardClass}>
			<CardHeader className="border-b px-5 py-5">
				<h2 className="font-heading text-lg font-semibold">Leave organization</h2>
				<p className="text-sm text-muted-foreground">
					{isOwner
						? "You own this organization. Transfer ownership to another administrator before leaving."
						: "You lose access to every project in this organization. Your open feedback returns to the unassigned queue."}
				</p>
			</CardHeader>
			<CardContent className="p-5">
				<Button variant="outline" disabled={isOwner} onClick={() => setOpen(true)}>
					<LogOut data-icon="inline-start" />
					Leave organization
				</Button>
			</CardContent>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title={`Leave ${organizationName}?`}
				description="An administrator has to invite you again to get access back."
				confirmLabel="Leave organization"
				pendingLabel="Leaving…"
				onConfirm={async () => {
					await leave({ organizationId });
					router.replace("/workspace");
				}}
			/>
		</Card>
	);
}

/** Organization deletion for the owner (typed-name confirm). */
export function DeleteOrganization({
	organizationId,
	organizationName,
}: {
	readonly organizationId: Id<"organizations">;
	readonly organizationName: string;
}) {
	const router = useRouter();
	const remove = useMutation(api.organizations.deletion.remove);
	const [open, setOpen] = useState(false);
	return (
		<Card className={`${cardClass} ring-destructive/25`}>
			<CardHeader className="border-b px-5 py-5">
				<h2 className="font-heading text-lg font-semibold text-destructive">Danger zone</h2>
				<p className="text-sm text-muted-foreground">
					Deleting the organization hides it and every project in it from everyone at once. You
					can restore it from organization settings for 7 days; after that all feedback, notes,
					activity, members, invitation links and taxonomies are permanently removed.
				</p>
			</CardHeader>
			<CardContent className="p-5">
				<Button variant="destructive" onClick={() => setOpen(true)}>
					<Trash2 data-icon="inline-start" />
					Delete organization
				</Button>
			</CardContent>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title={`Delete ${organizationName}?`}
				description="The organization and its projects disappear for everyone right away. You can restore them from organization settings for 7 days; after that the data is permanently deleted (at once if you delete your account)."
				confirmLabel="Delete organization"
				pendingLabel="Deleting…"
				confirmText={organizationName}
				onConfirm={async (typed) => {
					await remove({ organizationId, confirmName: typed });
					router.replace("/workspace");
				}}
			/>
		</Card>
	);
}
