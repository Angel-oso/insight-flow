import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import schema from "../schema";

const taxonomyItem = schema.tables.taxonomies.validator.fields.items.element;
const taxonomyKeyValidator = schema.tables.taxonomies.validator.fields.key;

export type TaxonomyKey = "status" | "category" | "priority";
export type TaxonomyItem = {
	value: string;
	label: string;
	rank: number;
	tone: "primary" | "info" | "success" | "warning" | "danger" | "muted";
	color?: string;
	isFinal?: boolean;
	chartToken?: string;
	description?: string;
};

/** Canonical display metadata. Mirrors the schema unions in schema.ts. */
const TAXONOMY_DEFAULTS: Record<
	TaxonomyKey,
	{ label: string; items: TaxonomyItem[] }
> = {
	status: {
		label: "Status",
		items: [
			{ value: "New", label: "New", rank: 0, tone: "info", color: "#3b82f6", isFinal: false, description: "Received and awaiting first triage." },
			{ value: "In review", label: "In review", rank: 1, tone: "warning", color: "#f59e0b", isFinal: false, description: "Someone is evaluating the feedback." },
			{ value: "Planned", label: "Planned", rank: 2, tone: "primary", color: "#7c3aed", isFinal: false, chartToken: "var(--dashboard-avatar-three)", description: "Accepted and scheduled for a future iteration." },
			{ value: "In progress", label: "In progress", rank: 3, tone: "primary", color: "#7c3aed", isFinal: false, description: "Actively being worked on." },
			{ value: "Completed", label: "Completed", rank: 4, tone: "success", color: "#16a34a", isFinal: true, description: "Resolved or shipped." },
			{ value: "Discarded", label: "Discarded", rank: 5, tone: "muted", color: "#6b7280", isFinal: true, description: "Closed without action." },
		],
	},
	category: {
		label: "Category",
		items: [
			{ value: "Bug", label: "Bug", rank: 0, tone: "danger", color: "#e11d48", description: "Something is broken." },
			{ value: "Feature request", label: "Feature request", rank: 1, tone: "primary", color: "#7c3aed", description: "A new capability teams are asking for." },
			{ value: "Improvement", label: "Improvement", rank: 2, tone: "info", color: "#3b82f6", description: "An existing flow that could work better." },
			{ value: "Question", label: "Question", rank: 3, tone: "warning", color: "#f59e0b", description: "Someone needs help or clarification." },
			{ value: "Other", label: "Other", rank: 4, tone: "muted", color: "#6b7280", description: "Anything that fits nowhere else." },
		],
	},
	priority: {
		label: "Priority",
		items: [
			{ value: "Low", label: "Low", rank: 0, tone: "muted", color: "#6b7280", description: "Nice to have, no urgency." },
			{ value: "Medium", label: "Medium", rank: 1, tone: "info", color: "#3b82f6", description: "Worth scheduling." },
			{ value: "High", label: "High", rank: 2, tone: "warning", color: "#f59e0b", description: "Needs attention soon." },
			{ value: "Critical", label: "Critical", rank: 3, tone: "danger", color: "#e11d48", description: "Requires intervention now." },
		],
	},
};

const TAXONOMY_KEYS: TaxonomyKey[] = ["status", "category", "priority"];

export { taxonomyKeyValidator };

/** Shared returns validator so workspace and overview stay in sync. */
export const taxonomiesValidator = v.object({
	statuses: v.array(taxonomyItem),
	categories: v.array(taxonomyItem),
	priorities: v.array(taxonomyItem),
});

/** Insert any missing taxonomy doc and backfill new item fields. Safe to run repeatedly. */
export async function ensureTaxonomies(ctx: MutationCtx) {
	for (const key of TAXONOMY_KEYS) {
		const existing = await ctx.db
			.query("taxonomies")
			.withIndex("by_key", (q) => q.eq("key", key))
			.unique();
		if (!existing) {
			await ctx.db.insert("taxonomies", {
				key,
				label: TAXONOMY_DEFAULTS[key].label,
				items: TAXONOMY_DEFAULTS[key].items,
			});
			continue;
		}
		// Backfill fields added after the doc was seeded; never overwrite edits.
		let patched = false;
		const items = existing.items.map((item) => {
			const fallback = TAXONOMY_DEFAULTS[key].items.find(
				(candidate) => candidate.value === item.value,
			);
			if (!fallback) return item;
			const next = { ...item };
			if (next.color === undefined && fallback.color !== undefined) {
				next.color = fallback.color;
				patched = true;
			}
			if (next.isFinal === undefined && fallback.isFinal !== undefined) {
				next.isFinal = fallback.isFinal;
				patched = true;
			}
			if (next.description === undefined && fallback.description !== undefined) {
				next.description = fallback.description;
				patched = true;
			}
			return next;
		});
		// Also append default values removed... no: only add canonical values
		// missing entirely (e.g. databases seeded before a value existed).
		for (const fallback of TAXONOMY_DEFAULTS[key].items) {
			if (!items.some((item) => item.value === fallback.value)) {
				items.push({ ...fallback });
				patched = true;
			}
		}
		if (patched) await ctx.db.patch("taxonomies", existing._id, { items });
	}
}

export type Taxonomies = {
	statuses: TaxonomyItem[];
	categories: TaxonomyItem[];
	priorities: TaxonomyItem[];
};

/** Read all three taxonomies; fall back to defaults for docs never seeded. */
export async function getTaxonomies(ctx: QueryCtx): Promise<Taxonomies> {
	const docs = await Promise.all(
		TAXONOMY_KEYS.map((key) =>
			ctx.db
				.query("taxonomies")
				.withIndex("by_key", (q) => q.eq("key", key))
				.unique(),
		),
	);
	const pick = (index: number, key: TaxonomyKey): TaxonomyItem[] =>
		docs[index]?.items.map((item) => ({ ...item })) ??
		TAXONOMY_DEFAULTS[key].items;
	return {
		statuses: pick(0, "status"),
		categories: pick(1, "category"),
		priorities: pick(2, "priority"),
	};
}

/** Statuses that close the backlog. Falls back to the seeded finals. */
export async function getFinalStatuses(ctx: QueryCtx): Promise<Set<string>> {
	const { statuses } = await getTaxonomies(ctx);
	return new Set(
		statuses
			.filter(
				(item) =>
					item.isFinal ??
					(item.value === "Completed" || item.value === "Discarded"),
			)
			.map((item) => item.value),
	);
}

/** Highest priority rank. Severity rules derive from it, not literals. */
export async function getMaxPriorityRank(ctx: QueryCtx): Promise<number> {
	const { priorities } = await getTaxonomies(ctx);
	return Math.max(0, ...priorities.map((item) => item.rank));
}

/** Lowest status rank, used as the "awaiting triage" lane. */
export async function getMinStatusRank(ctx: QueryCtx): Promise<number> {
	const { statuses } = await getTaxonomies(ctx);
	return Math.min(...statuses.map((item) => item.rank));
}

/** Priority value → rank lookup for severity rules. */
export async function getPriorityRanks(ctx: QueryCtx): Promise<Map<string, number>> {
	const { priorities } = await getTaxonomies(ctx);
	return new Map(priorities.map((item) => [item.value, item.rank]));
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function slugify(label: string) {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

export function checkedLabel(label: string) {
	const clean = label.trim();
	if (clean.length === 0 || clean.length > 40)
		throw new ConvexError("Give the option a name between 1 and 40 characters.");
	return clean;
}

export function checkedColor(color: string) {
	if (!HEX_COLOR.test(color.trim()))
		throw new ConvexError("Pick a valid #rrggbb color.");
	return color.trim().toLowerCase();
}

export function checkedRank(rank: number) {
	if (!Number.isInteger(rank) || rank < 0 || rank > 99)
		throw new ConvexError("Rank must be a whole number between 0 and 99.");
	return rank;
}
