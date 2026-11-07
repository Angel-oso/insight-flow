import type { Doc, Id } from "@/convex/_generated/dataModel";

// Display metadata (labels, ranks, tones) lives in the taxonomies table;
// these types mirror the schema unions for compile-time safety.
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

/**
 * A feedback row as the server returns it to members: `sender.email` is
 * null when the viewer may not see submitter emails (no feedback.triage).
 */
export type FeedbackRecord = Omit<Doc<"feedback">, "sender"> & {
	sender: { name: string; email: string | null } | null;
};

/** Presentation boundary: stored dates and IDs remain unchanged in Convex. */
export function presentFeedback(
	item: FeedbackRecord,
	project: string,
	now: number,
	finals: ReadonlySet<string>,
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
		receivedAtMs: item.receivedAt,
		inactiveDays,
		isStale:
			!finals.has(item.status) && inactiveDays >= 7,
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

export function presentComments(
	comments: readonly (Doc<"comments"> & { author: string })[],
	now: number,
): FeedbackComment[] {
	return comments.map((comment) => ({
		id: comment._id,
		author: comment.author,
		initials: initials(comment.author),
		body: comment.body,
		time: relativeTime(comment.createdAt, now),
	}));
}

export function presentActivities(
	activities: readonly Doc<"activities">[],
	now: number,
): FeedbackActivity[] {
	return activities.map((activity) => ({
		id: activity._id,
		message: activity.message,
		time: relativeTime(activity.createdAt, now),
		tone: activity.type === "received" ? "primary" : "neutral",
	}));
}
