export type MemberRole = "Administrator" | "Manager" | "Member";

export type TeamMember = {
	name: string;
	email: string;
	initials: string;
	role: MemberRole;
	projects: readonly string[];
	openFeedback: number;
	criticalFeedback: number;
	lastActivity: string;
	joined: string;
};

export const teamMembers: readonly TeamMember[] = [
	{
		name: "Sarah Johnson",
		email: "sarah@acme.studio",
		initials: "SJ",
		role: "Administrator",
		projects: ["Client Portal", "Mobile App", "Academy"],
		openFeedback: 12,
		criticalFeedback: 0,
		lastActivity: "12 min ago",
		joined: "Joined Mar 2026",
	},
	{
		name: "Michael Chen",
		email: "michael@acme.studio",
		initials: "MC",
		role: "Manager",
		projects: ["Client Portal", "Mobile App"],
		openFeedback: 16,
		criticalFeedback: 1,
		lastActivity: "46 min ago",
		joined: "Joined Apr 2026",
	},
	{
		name: "Emma Rodriguez",
		email: "emma@acme.studio",
		initials: "ER",
		role: "Member",
		projects: ["Academy"],
		openFeedback: 8,
		criticalFeedback: 0,
		lastActivity: "2 hr ago",
		joined: "Joined Apr 2026",
	},
	{
		name: "Daniel Smith",
		email: "daniel@acme.studio",
		initials: "DS",
		role: "Member",
		projects: ["Client Portal"],
		openFeedback: 11,
		criticalFeedback: 1,
		lastActivity: "4 hr ago",
		joined: "Joined May 2026",
	},
	{
		name: "Priya Patel",
		email: "priya@acme.studio",
		initials: "PP",
		role: "Member",
		projects: ["Mobile App"],
		openFeedback: 10,
		criticalFeedback: 0,
		lastActivity: "Yesterday",
		joined: "Joined May 2026",
	},
];

export const roles = ["Administrator", "Manager", "Member"] as const;
