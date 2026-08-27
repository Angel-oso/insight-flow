"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MemberRole, TeamMember } from "./data";
import { roles } from "./data";

type RoleFilter = "All" | MemberRole;

const roleStyles: Record<MemberRole, string> = {
	Administrator: "bg-dashboard-primary-soft text-dashboard-primary",
	Manager: "bg-dashboard-info-soft text-dashboard-info",
	Member: "bg-muted text-muted-foreground",
};

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
			className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${roleStyles[role]}`}
		>
			{role}
		</span>
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
}: {
	readonly members: readonly TeamMember[];
}) {
	const [query, setQuery] = useState("");
	const [role, setRole] = useState<RoleFilter>("All");

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

	return (
		<section className="rounded-xl bg-card ring-1 ring-foreground/10">
			<div className="flex flex-col gap-4 border-b p-5">
				<div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">
							People and workload
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Assignments reflect the current open feedback queue.
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
						{(["All", ...roles] as const).map((option) => (
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
			</div>

			{visibleMembers.length > 0 ? (
				<>
					<div className="hidden overflow-x-auto md:block">
						<table className="w-full min-w-[720px] text-left text-sm">
							<thead className="border-b text-xs text-muted-foreground">
								<tr>
									<th className="px-5 py-3 font-medium">Member</th>
									<th className="px-5 py-3 font-medium">Access</th>
									<th className="px-5 py-3 font-medium">Projects</th>
									<th className="px-5 py-3 text-right font-medium">Open</th>
									<th className="px-5 py-3 font-medium">Last activity</th>
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
											<RoleBadge role={member.role} />
										</td>
										<td className="px-5 py-4 text-muted-foreground">
											{member.projects.join(" · ")}
										</td>
										<td className="px-5 py-4 text-right tabular-nums">
											<p className="font-medium">{member.openFeedback}</p>
											<p className="mt-0.5 text-xs text-muted-foreground">
												{member.criticalFeedback > 0
													? `${member.criticalFeedback} critical`
													: "No critical items"}
											</p>
										</td>
										<td className="px-5 py-4">
											<p>{member.lastActivity}</p>
											<p className="mt-0.5 text-xs text-muted-foreground">
												{member.joined}
											</p>
										</td>
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
									<RoleBadge role={member.role} />
								</div>
								<div className="grid grid-cols-2 gap-4 border-t pt-4 text-sm">
									<div>
										<p className="text-xs text-muted-foreground">Projects</p>
										<p className="mt-1 leading-5">
											{member.projects.join(" · ")}
										</p>
									</div>
									<div>
										<p className="text-xs text-muted-foreground">
											Open feedback
										</p>
										<p className="mt-1 font-medium tabular-nums">
											{member.openFeedback}
											{member.criticalFeedback > 0
												? ` · ${member.criticalFeedback} critical`
												: " · no critical"}
										</p>
									</div>
								</div>
								<p className="text-xs text-muted-foreground">
									Last activity {member.lastActivity} · {member.joined}
								</p>
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
