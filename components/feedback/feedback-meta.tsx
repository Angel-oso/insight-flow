import type {
	FeedbackCategory,
	FeedbackPriority,
	FeedbackStatus,
} from "./model";

const priorityStyles: Record<FeedbackPriority, string> = {
	Low: "bg-muted text-muted-foreground",
	Medium: "bg-dashboard-info-soft text-dashboard-info",
	High: "bg-dashboard-warning-soft text-dashboard-warning-foreground",
	Critical: "bg-dashboard-danger-soft text-dashboard-danger",
};

const statusStyles: Record<FeedbackStatus, string> = {
	New: "bg-dashboard-info-soft text-dashboard-info",
	"In review": "bg-dashboard-warning-soft text-dashboard-warning-foreground",
	Planned: "bg-dashboard-primary-soft text-dashboard-primary",
	"In progress": "bg-dashboard-primary-soft text-dashboard-primary",
	Completed: "bg-dashboard-success-soft text-dashboard-success",
	Discarded: "bg-muted text-muted-foreground",
};

const categoryStyles: Record<FeedbackCategory, string> = {
	Bug: "bg-dashboard-danger-soft text-dashboard-danger",
	"Feature request": "bg-dashboard-primary-soft text-dashboard-primary",
	Improvement: "bg-dashboard-info-soft text-dashboard-info",
	Question: "bg-dashboard-warning-soft text-dashboard-warning-foreground",
	Other: "bg-muted text-muted-foreground",
};

function FeedbackTag({
	value,
	kind,
}: {
	readonly value: FeedbackCategory | FeedbackPriority | FeedbackStatus;
	readonly kind: "category" | "priority" | "status";
}) {
	const styles =
		kind === "category"
			? categoryStyles[value as FeedbackCategory]
			: kind === "priority"
				? priorityStyles[value as FeedbackPriority]
				: statusStyles[value as FeedbackStatus];

	return (
		<span
			className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${styles}`}
		>
			{value}
		</span>
	);
}

export { FeedbackTag };
