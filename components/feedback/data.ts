export const feedbackCategories = [
	"Bug",
	"Feature request",
	"Improvement",
	"Question",
	"Other",
] as const;

export const feedbackPriorities = [
	"Low",
	"Medium",
	"High",
	"Critical",
] as const;

export const feedbackStatuses = [
	"New",
	"In review",
	"Planned",
	"In progress",
	"Completed",
	"Discarded",
] as const;

export const feedbackProjects = [
	"Client Portal",
	"Mobile App",
	"Academy",
] as const;

export const assignees = [
	{ id: "sarah", name: "Sarah Johnson", initials: "SJ" },
	{ id: "michael", name: "Michael Chen", initials: "MC" },
	{ id: "emma", name: "Emma Rodriguez", initials: "ER" },
	{ id: "daniel", name: "Daniel Smith", initials: "DS" },
	{ id: "priya", name: "Priya Patel", initials: "PP" },
] as const;

export type FeedbackCategory = (typeof feedbackCategories)[number];
export type FeedbackPriority = (typeof feedbackPriorities)[number];
export type FeedbackStatus = (typeof feedbackStatuses)[number];
export type FeedbackProject = (typeof feedbackProjects)[number];
export type Assignee = (typeof assignees)[number];

export type FeedbackItem = {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly project: FeedbackProject;
	readonly category: FeedbackCategory;
	readonly priority: FeedbackPriority;
	readonly status: FeedbackStatus;
	readonly assigneeId: Assignee["id"] | null;
	readonly sender: { readonly name: string; readonly email: string } | null;
	readonly receivedAt: string;
	readonly updatedAt: string;
	readonly ageDays: number;
	readonly isStale: boolean;
};

export type FeedbackComment = {
	readonly id: string;
	readonly author: string;
	readonly initials: string;
	readonly body: string;
	readonly time: string;
};

export type FeedbackActivity = {
	readonly id: string;
	readonly message: string;
	readonly time: string;
	readonly tone: "neutral" | "primary" | "warning" | "success";
};

export const feedbackItems = [
	{
		id: "fb-001",
		title: "Login failure on SSO",
		description:
			"Users are returned to the sign-in screen after authenticating through the organization SSO provider. The issue appears for accounts created this week.",
		project: "Client Portal",
		category: "Bug",
		priority: "Critical",
		status: "New",
		assigneeId: null,
		sender: { name: "Nadia Flores", email: "nadia@northstar.io" },
		receivedAt: "May 24, 2026",
		updatedAt: "3 days ago",
		ageDays: 3,
		isStale: false,
	},
	{
		id: "fb-002",
		title: "Checkout stalls after payment",
		description:
			"After payment confirmation, the checkout stays on the loading state and customers do not receive a receipt. The payment is still captured.",
		project: "Mobile App",
		category: "Bug",
		priority: "Critical",
		status: "New",
		assigneeId: null,
		sender: { name: "Jordan Lee", email: "jordan@pollen.shop" },
		receivedAt: "May 25, 2026",
		updatedAt: "2 days ago",
		ageDays: 2,
		isStale: false,
	},
	{
		id: "fb-003",
		title: "Invite links expire immediately",
		description:
			"New team invitations display an expired-link message when recipients open them from their email. Reproduced in Chrome and Safari.",
		project: "Client Portal",
		category: "Bug",
		priority: "High",
		status: "In review",
		assigneeId: "michael",
		sender: { name: "Rae Kim", email: "rae@fieldwork.co" },
		receivedAt: "May 20, 2026",
		updatedAt: "5 days ago",
		ageDays: 5,
		isStale: false,
	},
	{
		id: "fb-004",
		title: "Course progress not updating",
		description:
			"Completing a lesson does not update the learner progress bar until the browser is refreshed. The completion event is visible in the activity log.",
		project: "Academy",
		category: "Bug",
		priority: "High",
		status: "In progress",
		assigneeId: "emma",
		sender: { name: "Ava Thompson", email: "ava@pathways.edu" },
		receivedAt: "May 17, 2026",
		updatedAt: "8 days ago",
		ageDays: 8,
		isStale: true,
	},
	{
		id: "fb-005",
		title: "Data export not working",
		description:
			"Exporting feedback from the reporting section finishes without downloading a file. The export button becomes available again after a few seconds.",
		project: "Mobile App",
		category: "Improvement",
		priority: "Medium",
		status: "Planned",
		assigneeId: "michael",
		sender: { name: "Maya Patel", email: "maya@fairview.app" },
		receivedAt: "May 22, 2026",
		updatedAt: "46 min ago",
		ageDays: 1,
		isStale: false,
	},
	{
		id: "fb-006",
		title: "Bulk invite limit",
		description:
			"Teams need to invite more than 25 people at once when opening a new workspace. A CSV import is not requested; a larger manual limit would be enough.",
		project: "Client Portal",
		category: "Feature request",
		priority: "High",
		status: "In review",
		assigneeId: "daniel",
		sender: { name: "Kira Owens", email: "kira@studioalba.com" },
		receivedAt: "May 19, 2026",
		updatedAt: "4 hr ago",
		ageDays: 4,
		isStale: false,
	},
	{
		id: "fb-007",
		title: "Typo in pricing page",
		description:
			"The pricing page describes the annual plan as monthly in the plan comparison table.",
		project: "Academy",
		category: "Other",
		priority: "Low",
		status: "Completed",
		assigneeId: "emma",
		sender: { name: "Tom Morgan", email: "tom@learningroom.io" },
		receivedAt: "May 16, 2026",
		updatedAt: "2 hr ago",
		ageDays: 10,
		isStale: false,
	},
	{
		id: "fb-008",
		title: "Where can I find webhook documentation?",
		description:
			"A project owner could not find the webhook setup reference from the integration settings screen.",
		project: "Mobile App",
		category: "Question",
		priority: "Low",
		status: "New",
		assigneeId: "priya",
		sender: { name: "Omar White", email: "omar@everlane.dev" },
		receivedAt: "May 26, 2026",
		updatedAt: "Yesterday",
		ageDays: 1,
		isStale: false,
	},
] as const satisfies readonly FeedbackItem[];

export const feedbackComments: Record<string, readonly FeedbackComment[]> = {
	"fb-001": [
		{
			id: "comment-001",
			author: "Sarah Johnson",
			initials: "SJ",
			body: "Confirmed that the issue needs an owner before the next client onboarding session.",
			time: "12 min ago",
		},
	],
	"fb-003": [
		{
			id: "comment-002",
			author: "Michael Chen",
			initials: "MC",
			body: "I can reproduce this with a fresh organization invite. Checking the token expiry path now.",
			time: "46 min ago",
		},
	],
	"fb-004": [
		{
			id: "comment-003",
			author: "Emma Rodriguez",
			initials: "ER",
			body: "The progress event is stored correctly; the learner view is not refreshing its local state.",
			time: "2 hr ago",
		},
	],
};

export const feedbackActivity: Record<string, readonly FeedbackActivity[]> = {
	"fb-001": [
		{
			id: "activity-001",
			message: "Feedback received through the Client Portal public link",
			time: "May 24, 10:18 AM",
			tone: "primary",
		},
		{
			id: "activity-002",
			message: "Priority set to Critical",
			time: "May 24, 10:22 AM",
			tone: "warning",
		},
	],
	"fb-003": [
		{
			id: "activity-003",
			message: "Michael Chen assigned as owner",
			time: "May 22, 9:41 AM",
			tone: "primary",
		},
		{
			id: "activity-004",
			message: "Status moved to In review",
			time: "May 22, 9:42 AM",
			tone: "neutral",
		},
	],
};
