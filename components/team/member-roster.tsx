"use client";

import { Search, UserMinus, X } from "lucide-react";
import { useMutation } from "convex/react";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { MemberRole, TeamMember } from "./model";

type RoleFilter = "All" | MemberRole;
type ProjectRole = FunctionReturnType<typeof api.projects.settings.roles>["roles"][number];

function roleStyle(role: string) {
	if (role === "admin") return "bg-dashboard-primary-soft text-dashboard-primary";
	if (role === "manager") return "bg-dashboard-info-soft text-dashboard-info";
	return "bg-muted text-muted-foreground";
}

const avatarStyles = [
	"bg-dashboard-primary-soft text-dashboard-primary",
	"bg-dashboard-info-soft text-dashboard-info",
	"bg-dashboard-success-soft text-dashboard-success",
	"bg-dashboard-warning-soft text-dashboard-warning-foreground",
	"bg-muted text-muted-foreground",
] as const;

function RoleBadge({ role }: { readonly role: MemberRole }) {
	return (
		<span
			className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${roleStyle(role)}`}
		>
			{role}
		</span>
	);
}

function RemoveMember({
	member,
	projectSlug,
	onError,
}: {
	readonly member: TeamMember;
	readonly projectSlug: string;
	readonly onError: (message: string | null) => void;
}) {
	const removeMember = useMutation(api.team.mutations.removeMember);
	const [confirming, setConfirming] = useState(false);
	const [pending, setPending] = useState(false);

	async function remove() {
		setPending(true);
		onError(null);
		try {
			await removeMember({ projectSlug, memberId: member.id });
		} catch (cause) {
			onError(cause instanceof Error ? cause.message : "Could not remove this member.");
			setConfirming(false);
		} finally {
			setPending(false);
		}
	}

	if (!confirming) {
		return (
			<Button
				size="sm"
				variant="ghost"
				aria-label={`Remove ${member.name} from this project`}
				onClick={() => setConfirming(true)}
			>
				<UserMinus data-icon="inline-start" />
				Remove
			</Button>
		);
	}
	return (
		<div className="flex flex-wrap items-center justify-end gap-1.5">
			<span className="text-xs text-muted-foreground">
				{member.openAssigned
					? `${member.openAssigned} open ${member.openAssigned === 1 ? "item returns" : "items return"} to unassigned.`
					: "Remove from project?"}
			</span>
			<Button size="sm" variant="destructive" disabled={pending} onClick={() => void remove()}>
				{pending ? "Removing…" : "Confirm"}
			</Button>
			<Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
				Cancel
			</Button>
		</div>
	);
}

function MemberIdentity({
	member,
	index,
}: {
	readonly member: TeamMember;
	readonly index: number;
}) {
	return (
		<div className="flex min-w-0 items-center gap-3">
			<Avatar className="size-9">
				<AvatarFallback className={avatarStyles[index]}>
					{member.initials}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0">
				<p className="truncate font-medium">{member.name}</p>
				<p className="truncate text-xs text-muted-foreground">{member.email}</p>
			</div>
		</div>
	);
}

export function MemberRoster({
	members,
	projectSlug,
	roles,
	canManageRoles,
	canManageTeam,
	currentUserId,
	showsWorkload,
}: {
	readonly showsWorkload: boolean;
	readonly members: readonly TeamMember[];
	readonly projectSlug: string;
	readonly roles: readonly ProjectRole[];
	readonly canManageRoles: boolean;
	readonly canManageTeam: boolean;
	readonly currentUserId: string | null;
}) {
	const canRemove = (member: TeamMember) => canManageTeam && member.id !== currentUserId;
	const [query, setQuery] = useState("");
	const [role, setRole] = useState<RoleFilter>("All");
	const [changingMemberId, setChangingMemberId] = useState<string | null>(null);
	const [roleError, setRoleError] = useState<string | null>(null);
	const setMemberRole = useMutation(api.team.mutations.setMemberRole);
	const memberRoles = useMemo(
		() => [...new Set(members.map((member) => member.role))].sort(),
		[members],
	);

	const visibleMembers = useMemo(
		() =>
			members.filter((member) => {
				const matchesQuery = `${member.name} ${member.email}`
					.toLowerCase()
					.includes(query.trim().toLowerCase());
				const matchesRole = role === "All" || member.role === role;

				return matchesQuery && matchesRole;
			}),
		[members, query, role],
	);

	const resetFilters = () => {
		setQuery("");
		setRole("All");
	};

	async function changeRole(member: TeamMember, roleId: ProjectRole["id"]) {
		if (roleId === member.roleId) return;
		setChangingMemberId(member.id);
		setRoleError(null);
		try {
			await setMemberRole({ projectSlug, memberId: member.id, roleId });
		} catch (cause) {
			setRoleError(cause instanceof Error ? cause.message : "Could not change this member's role.");
		} finally {
			setChangingMemberId(null);
		}
	}

	return (
		<section className="rounded-xl bg-card ring-1 ring-foreground/10">
			<div className="flex flex-col gap-4 border-b p-5">
				<div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">
							People and workload
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							{showsWorkload
								? "Assignments reflect the current open feedback queue."
								: "Who works on this project and their role."}
						</p>
					</div>
					<p className="text-sm text-muted-foreground">
						{visibleMembers.length} of {members.length} members
					</p>
				</div>

				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div className="relative block max-w-sm flex-1">
						<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							aria-label="Search members"
							className="pl-8"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search by name or email"
						/>
					</div>
					<fieldset className="flex flex-wrap items-center gap-1.5">
						<legend className="sr-only">Filter by role</legend>
						{(["All", ...memberRoles] as const).map((option) => (
							<Button
								key={option}
								size="sm"
								variant={role === option ? "secondary" : "ghost"}
								onClick={() => setRole(option)}
								aria-pressed={role === option}
							>
								{option}
							</Button>
						))}
					</fieldset>
				</div>
				{roleError ? <p role="alert" className="text-sm text-destructive">{roleError}</p> : null}
			</div>

			{visibleMembers.length > 0 ? (
				<>
					<div className="hidden overflow-x-auto md:block">
						<table className="w-full min-w-[820px] text-left text-sm">
							<thead className="border-b text-xs text-muted-foreground">
								<tr>
									<th className="px-5 py-3 font-medium">Member</th>
									<th className="px-5 py-3 font-medium">Access</th>
									{showsWorkload ? (
										<>
											<th className="px-5 py-3 font-medium">Scope</th>
											<th className="px-5 py-3 text-right font-medium">Open</th>
											<th className="px-5 py-3 font-medium">Last activity</th>
										</>
									) : (
										<th className="px-5 py-3 font-medium">Joined</th>
									)}
									{canManageTeam ? (
										<th className="px-5 py-3 text-right font-medium">
											<span className="sr-only">Actions</span>
										</th>
									) : null}
								</tr>
							</thead>
							<tbody className="divide-y">
								{visibleMembers.map((member, index) => (
									<tr
										key={member.email}
										className="transition-colors hover:bg-muted/40"
									>
										<td className="px-5 py-4">
											<MemberIdentity member={member} index={index} />
										</td>
										<td className="px-5 py-4">
											{canManageRoles ? (
												<select aria-label={`Change role for ${member.name}`} value={member.roleId} disabled={changingMemberId === member.id} onChange={(event) => void changeRole(member, event.target.value as ProjectRole["id"])} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
													{roles.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
												</select>
											) : <RoleBadge role={member.role} />}
										</td>
										{showsWorkload ? (
											<>
												<td className="px-5 py-4 text-muted-foreground">
													{member.projectCount}{" "}
													{member.projectCount === 1 ? "project" : "projects"}
												</td>
												<td className="px-5 py-4 text-right tabular-nums">
													<p className="font-medium">{member.openAssigned}</p>
													<p className="mt-0.5 text-xs text-muted-foreground">
														{member.criticalAssigned
															? `${member.criticalAssigned} critical`
															: "No critical items"}
													</p>
												</td>
												<td className="px-5 py-4">
													<p>{member.lastActivity}</p>
													<p className="mt-0.5 text-xs text-muted-foreground">
														{member.joined}
													</p>
												</td>
											</>
										) : (
											<td className="px-5 py-4 text-muted-foreground">{member.joined}</td>
										)}
										{canManageTeam ? (
											<td className="px-5 py-4 text-right">
												{canRemove(member) ? (
													<RemoveMember member={member} projectSlug={projectSlug} onError={setRoleError} />
												) : (
													<span className="text-xs text-muted-foreground">You</span>
												)}
											</td>
										) : null}
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<div className="divide-y md:hidden">
						{visibleMembers.map((member, index) => (
							<article key={member.email} className="space-y-4 p-5">
								<div className="flex items-start justify-between gap-4">
									<MemberIdentity member={member} index={index} />
									{canManageRoles ? (
										<select aria-label={`Change role for ${member.name}`} value={member.roleId} disabled={changingMemberId === member.id} onChange={(event) => void changeRole(member, event.target.value as ProjectRole["id"])} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
											{roles.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
										</select>
									) : <RoleBadge role={member.role} />}
								</div>
								{showsWorkload ? (
								<div className="grid grid-cols-2 gap-4 border-t pt-4 text-sm">
									<div>
										<p className="text-xs text-muted-foreground">Scope</p>
										<p className="mt-1 leading-5">
											{member.projectCount}{" "}
											{member.projectCount === 1 ? "project" : "projects"}
										</p>
									</div>
									<div>
										<p className="text-xs text-muted-foreground">
											Open feedback
										</p>
										<p className="mt-1 font-medium tabular-nums">
											{member.openAssigned}
											{member.criticalAssigned
												? ` · ${member.criticalAssigned} critical`
												: " · no critical"}
										</p>
									</div>
								</div>
								) : null}
								<p className="text-xs text-muted-foreground">
									{showsWorkload ? `Last activity ${member.lastActivity} · ` : ""}
									{member.joined}
								</p>
								{canRemove(member) ? (
									<RemoveMember member={member} projectSlug={projectSlug} onError={setRoleError} />
								) : null}
							</article>
						))}
					</div>
				</>
			) : (
				<div className="flex flex-col items-start gap-3 p-6">
					<p className="font-medium">No members match these filters.</p>
					<p className="text-sm text-muted-foreground">
						Try another name, email, or role.
					</p>
					<Button variant="outline" size="sm" onClick={resetFilters}>
						<X data-icon="inline-start" />
						Clear filters
					</Button>
				</div>
			)}
		</section>
	);
}
