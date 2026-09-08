import type { Taxonomies } from "@/lib/taxonomy";
import { taxonomyItemFor, taxonomyToneBadge } from "@/lib/taxonomy";
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
			className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${taxonomyToneBadge[item.tone]}`}
		>
			{item.label}
		</span>
	);
}
