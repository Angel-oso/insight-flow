import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type TeamQueryData = FunctionReturnType<typeof api.team.get>;

export type MemberRole = "Administrator" | "Manager" | "Member";

const roleLabels: Record<string, MemberRole> = {
	admin: "Administrator",
	manager: "Manager",
	member: "Member",
};

export const memberRoles: readonly MemberRole[] = [
	"Administrator",
	"Manager",
	"Member",
];

export type TeamMember = {
	readonly id: Id<"users">;
	readonly name: string;
	readonly email: string;
	readonly initials: string;
	readonly role: MemberRole;
	readonly projectCount: number;
	readonly openAssigned: number;
	readonly criticalAssigned: number;
	readonly lastActivity: string;
	readonly joined: string;
};

export type TeamSummaryData = {
	readonly memberCount: number;
	readonly coordinatorCount: number;
	readonly openAssigned: number;
	readonly unassigned: number;
	readonly critical: number;
	readonly criticalLabel: string | null;
	readonly criticalColor: string | null;
};

export type PresentedTeam = {
	readonly summary: TeamSummaryData;
	readonly members: readonly TeamMember[];
};

export function initials(name: string) {
	return name
		.split(/\s+/)
		.map((part) => part[0])
		.slice(0, 2)
		.join("");
}

function relativeTime(timestamp: number, now: number) {
	const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes} min ago`;
	if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
	return `${Math.floor(minutes / 1440)} days ago`;
}

/** Presentation boundary: timestamps become team copy. */
export function presentTeam(data: TeamQueryData, now: number): PresentedTeam {
	return {
		summary: { ...data.summary },
		members: data.members.map((member) => ({
			id: member.id,
			name: member.name,
			email: member.email,
			initials: initials(member.name),
			role: roleLabels[member.role] ?? "Member",
			projectCount: member.projectCount,
			openAssigned: member.openAssigned,
			criticalAssigned: member.criticalAssigned,
			lastActivity:
				member.lastActivityAt === null
					? "No recorded activity"
					: relativeTime(member.lastActivityAt, now),
			joined: `Joined ${new Date(member.joinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`,
		})),
	};
}
