import { ConvexError, v } from "convex/values";
import {
	env,
	internalMutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "./_generated/server";
import schema from "./schema";

const taxonomyItem = schema.tables.taxonomies.validator.fields.items.element;

type TaxonomyKey = "status" | "category" | "priority";
type TaxonomyItem = {
	value: string;
	label: string;
	rank: number;
	tone: "primary" | "info" | "success" | "warning" | "danger" | "muted";
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
			{ value: "New", label: "New", rank: 0, tone: "info", description: "Received and awaiting first triage." },
			{ value: "In review", label: "In review", rank: 1, tone: "warning", description: "Someone is evaluating the feedback." },
			{ value: "Planned", label: "Planned", rank: 2, tone: "primary", chartToken: "var(--dashboard-avatar-three)", description: "Accepted and scheduled for a future iteration." },
			{ value: "In progress", label: "In progress", rank: 3, tone: "primary", description: "Actively being worked on." },
			{ value: "Completed", label: "Completed", rank: 4, tone: "success", description: "Resolved or shipped." },
			{ value: "Discarded", label: "Discarded", rank: 5, tone: "muted", description: "Closed without action." },
		],
	},
	category: {
		label: "Category",
		items: [
			{ value: "Bug", label: "Bug", rank: 0, tone: "danger", description: "Something is broken." },
			{ value: "Feature request", label: "Feature request", rank: 1, tone: "primary", description: "A new capability teams are asking for." },
			{ value: "Improvement", label: "Improvement", rank: 2, tone: "info", description: "An existing flow that could work better." },
			{ value: "Question", label: "Question", rank: 3, tone: "warning", description: "Someone needs help or clarification." },
			{ value: "Other", label: "Other", rank: 4, tone: "muted", description: "Anything that fits nowhere else." },
		],
	},
	priority: {
		label: "Priority",
		items: [
			{ value: "Low", label: "Low", rank: 0, tone: "muted", description: "Nice to have, no urgency." },
			{ value: "Medium", label: "Medium", rank: 1, tone: "info", description: "Worth scheduling." },
			{ value: "High", label: "High", rank: 2, tone: "warning", description: "Needs attention soon." },
			{ value: "Critical", label: "Critical", rank: 3, tone: "danger", description: "Requires intervention now." },
		],
	},
};

const TAXONOMY_KEYS: TaxonomyKey[] = ["status", "category", "priority"];

/** Shared returns validator so workspace and overview stay in sync. */
export const taxonomiesValidator = v.object({
	statuses: v.array(taxonomyItem),
	categories: v.array(taxonomyItem),
	priorities: v.array(taxonomyItem),
});

/** Insert any missing taxonomy doc. Safe to run repeatedly. */
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
		}
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

export const list = query({
	args: {},
	returns: v.array(schema.doc("taxonomies")),
	handler: async (ctx) => {
		if (env.DEMO_ENABLED !== "true")
			throw new ConvexError("The demo workspace is unavailable.");
		return await ctx.db.query("taxonomies").withIndex("by_key").collect();
	},
});

export const ensureDefaults = internalMutation({
	args: {},
	returns: taxonomiesValidator,
	handler: async (ctx) => {
		await ensureTaxonomies(ctx);
		return await getTaxonomies(ctx);
	},
});
