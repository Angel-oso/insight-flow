import type { Doc, Id } from "@/convex/_generated/dataModel";

export const feedbackCategories = [
	"Bug",
	"Feature request",
	"Improvement",
	"Question",
	"Other",
] as const satisfies readonly Doc<"feedback">["category"][];
export const feedbackPriorities = [
	"Low",
	"Medium",
	"High",
	"Critical",
] as const satisfies readonly Doc<"feedback">["priority"][];
export const feedbackStatuses = [
	"New",
	"In review",
	"Planned",
	"In progress",
	"Completed",
	"Discarded",
] as const satisfies readonly Doc<"feedback">["status"][];
export type FeedbackCategory = Doc<"feedback">["category"];
export type FeedbackPriority = Doc<"feedback">["priority"];
export type FeedbackStatus = Doc<"feedback">["status"];
export type FeedbackUpdate = Partial<
	Pick<Doc<"feedback">, "category" | "priority" | "status" | "assigneeId">
>;

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

/** Presentation boundary: stored dates and IDs remain unchanged in Convex. */
export function presentFeedback(
	item: Doc<"feedback">,
	project: string,
	now: number,
) {
	const ageDays = Math.max(0, Math.floor((now - item.receivedAt) / 86400000));
	const inactiveDays = Math.max(
		0,
		Math.floor((now - item.updatedAt) / 86400000),
	);
	return {
		...item,
		id: item._id,
		project,
		ageDays,
		inactiveDays,
		isStale:
			item.status !== "Completed" &&
			item.status !== "Discarded" &&
			inactiveDays >= 7,
		receivedAt: new Date(item.receivedAt).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		}),
		updatedAt: relativeTime(item.updatedAt, now),
	};
}

export type FeedbackItem = ReturnType<typeof presentFeedback>;
export type Assignee = { id: Id<"users">; name: string; initials: string };
export type FeedbackComment = {
	id: Id<"comments">;
	author: string;
	initials: string;
	body: string;
	time: string;
};
export type FeedbackActivity = {
	id: Id<"activities">;
	message: string;
	time: string;
	tone: "neutral" | "primary" | "warning" | "success";
};

export function presentDiscussion(
	data: {
		comments: (Doc<"comments"> & { author: string })[];
		activities: Doc<"activities">[];
	},
	now: number,
) {
	return {
		comments: data.comments.map((comment) => ({
			id: comment._id,
			author: comment.author,
			initials: initials(comment.author),
			body: comment.body,
			time: relativeTime(comment.createdAt, now),
		})),
		activities: data.activities.map((activity) => ({
			id: activity._id,
			message: activity.message,
			time: relativeTime(activity.createdAt, now),
			tone:
				activity.type === "received"
					? ("primary" as const)
					: ("neutral" as const),
		})),
	};
}
