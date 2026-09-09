import type { Taxonomies } from "@/lib/taxonomy";
import { taxonomyBadgeClass, taxonomyColorStyle, taxonomyItemFor } from "@/lib/taxonomy";
import type {
	FeedbackCategory,
	FeedbackPriority,
	FeedbackStatus,
} from "./model";

export function FeedbackTag({
	value,
	kind,
	taxonomies,
}: {
	readonly value: FeedbackCategory | FeedbackPriority | FeedbackStatus;
	readonly kind: "category" | "priority" | "status";
	readonly taxonomies: Taxonomies;
}) {
	const items =
		kind === "category"
			? taxonomies.categories
			: kind === "priority"
				? taxonomies.priorities
				: taxonomies.statuses;
	const item = taxonomyItemFor(items, value);

	return (
		<span
			style={item.color ? taxonomyColorStyle(item.color) : undefined}
			className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${item.color ? "" : taxonomyBadgeClass(item)}`}
		>
			{item.label}
		</span>
	);
}
