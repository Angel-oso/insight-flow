import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "../_generated/server";
import { requireCapability, requireProject } from "../feedback/access";
import {
	checkedColor,
	checkedLabel,
	checkedRank,
	ensureTaxonomies,
	slugify,
	taxonomyKeyValidator,
} from "./lib";

/** Authorize against the project before materializing organization defaults. */
async function requireTaxonomyAdmin(ctx: MutationCtx, projectSlug: string) {
	const { project, access } = await requireProject(ctx, projectSlug);
	requireCapability(access.permissions, "organization.manage");
	const docs = await ctx.db.query("taxonomies")
		.withIndex("by_organizationId_key", (q) => q.eq("organizationId", project.organizationId))
		.take(3);
	// Backfill only during initialization, not on every edit: removed defaults
	// must stay removed when the next option is changed.
	if (docs.length < 3) await ensureTaxonomies(ctx, project.organizationId);
	return project.organizationId;
}

export const createOption = mutation({
	args: {
		projectSlug: v.string(),
		key: taxonomyKeyValidator,
		label: v.string(),
		color: v.string(),
		rank: v.optional(v.number()),
		description: v.optional(v.string()),
		isFinal: v.optional(v.boolean()),
	},
	returns: v.object({ value: v.string() }),
	handler: async (ctx, args) => {
		const organizationId = await requireTaxonomyAdmin(ctx, args.projectSlug);
		const label = checkedLabel(args.label);
		const color = checkedColor(args.color);
		const doc = await ctx.db
			.query("taxonomies")
			.withIndex("by_organizationId_key", (q) => q.eq("organizationId", organizationId).eq("key", args.key))
			.unique();
		if (!doc) throw new ConvexError("Taxonomy not found.");
		const base = slugify(label);
		if (!base) throw new ConvexError("The name must contain letters or numbers.");
		let value = base;
		for (
			let suffix = 2;
			doc.items.some((item) => item.value === value);
			suffix += 1
		) {
			value = `${base}-${suffix}`;
		}
		const rank =
			args.rank === undefined
				? Math.max(0, ...doc.items.map((item) => item.rank)) + 1
				: checkedRank(args.rank);
		const description = args.description?.trim().slice(0, 200) || undefined;
		await ctx.db.patch("taxonomies", doc._id, {
			items: [
				...doc.items,
				{
					value,
					label,
					rank,
					tone: "muted" as const,
					color,
					...(args.key === "status" ? { isFinal: args.isFinal ?? false } : {}),
					...(description ? { description } : {}),
				},
			],
		});
		return { value };
	},
});

export const updateOption = mutation({
	args: {
		projectSlug: v.string(),
		key: taxonomyKeyValidator,
		value: v.string(),
		label: v.optional(v.string()),
		color: v.optional(v.string()),
		rank: v.optional(v.number()),
		description: v.optional(v.string()),
		isFinal: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const organizationId = await requireTaxonomyAdmin(ctx, args.projectSlug);
		const doc = await ctx.db
			.query("taxonomies")
			.withIndex("by_organizationId_key", (q) => q.eq("organizationId", organizationId).eq("key", args.key))
			.unique();
		if (!doc) throw new ConvexError("Taxonomy not found.");
		const index = doc.items.findIndex((item) => item.value === args.value);
		if (index === -1) throw new ConvexError("Option not found.");
		const current = doc.items[index];
		const next = { ...current };
		let changed = false;
		if (args.label !== undefined) {
			const label = checkedLabel(args.label);
			if (label !== current.label) {
				next.label = label;
				changed = true;
			}
		}
		if (args.color !== undefined) {
			const color = checkedColor(args.color);
			if (color !== current.color) {
				next.color = color;
				changed = true;
			}
		}
		if (args.rank !== undefined) {
			const rank = checkedRank(args.rank);
			if (rank !== current.rank) {
				next.rank = rank;
				changed = true;
			}
		}
		if (args.description !== undefined) {
			const description = args.description.trim().slice(0, 200) || undefined;
			if (description !== current.description) {
				next.description = description;
				changed = true;
			}
		}
		if (args.key === "status" && args.isFinal !== undefined) {
			const isFinal = args.isFinal;
			if (isFinal !== (current.isFinal ?? false)) {
				next.isFinal = isFinal;
				changed = true;
			}
		}
		if (!changed) return null;
		const items = doc.items.map((item, position) =>
			position === index ? next : item,
		);
		await ctx.db.patch("taxonomies", doc._id, { items });
		return null;
	},
});

export const removeOption = mutation({
	args: { projectSlug: v.string(), key: taxonomyKeyValidator, value: v.string() },
	returns: v.null(),
	handler: async (ctx, { projectSlug, key, value }) => {
		const organizationId = await requireTaxonomyAdmin(ctx, projectSlug);
		const doc = await ctx.db
			.query("taxonomies")
			.withIndex("by_organizationId_key", (q) => q.eq("organizationId", organizationId).eq("key", key))
			.unique();
		if (!doc) throw new ConvexError("Taxonomy not found.");
		if (!doc.items.some((item) => item.value === value))
			throw new ConvexError("Option not found.");
		if (doc.items.length <= 1)
			throw new ConvexError("A taxonomy needs at least one option.");
		// Check every project in this organization, including those the caller cannot enter.
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
			.take(101);
		if (projects.length > 100)
			throw new ConvexError("Taxonomy removal supports up to 100 projects per organization.");
		for (const project of projects) {
			const used = key === "status"
				? await ctx.db.query("feedback")
					.withIndex("by_projectId_status", (q) => q.eq("projectId", project._id).eq("status", value)).take(1)
				: key === "category"
					? await ctx.db.query("feedback")
						.withIndex("by_projectId_category", (q) => q.eq("projectId", project._id).eq("category", value)).take(1)
					: await ctx.db.query("feedback")
						.withIndex("by_projectId_priority", (q) => q.eq("projectId", project._id).eq("priority", value)).take(1);
			if (used.length > 0)
				throw new ConvexError("This option is still used by feedback and cannot be removed.");
		}
		await ctx.db.patch("taxonomies", doc._id, {
			items: doc.items.filter((item) => item.value !== value),
		});
		return null;
	},
});
