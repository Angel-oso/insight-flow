import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "../_generated/server";
import { requireCapability } from "../feedback/access";
import type { Id } from "../_generated/dataModel";
import {
	checkedColor,
	checkedLabel,
	checkedRank,
	slugify,
	taxonomyKeyValidator,
} from "./lib";

/**
 * Global taxonomy writes need a real administrator: the caller must be
 * authenticated and hold the admin role in at least one organization.
 * Taxonomies are shared display metadata, so any org admin may curate them.
 */
async function requireTaxonomyAdmin(ctx: MutationCtx) {
	const userId = await getAuthUserId(ctx);
	if (!userId) throw new ConvexError("Sign in to access this workspace.");
	const adminMembership = await ctx.db
		.query("memberships")
		.withIndex("by_userId", (q) => q.eq("userId", userId as Id<"users">))
		.filter((q) => q.eq(q.field("role"), "admin"))
		.first();
	if (!adminMembership)
		throw new ConvexError("Only a workspace administrator can do this.");
	requireCapability(adminMembership.role, "project.manage");
}

export const createOption = mutation({
	args: {
		key: taxonomyKeyValidator,
		label: v.string(),
		color: v.string(),
		rank: v.optional(v.number()),
		description: v.optional(v.string()),
		isFinal: v.optional(v.boolean()),
	},
	returns: v.object({ value: v.string() }),
	handler: async (ctx, args) => {
		await requireTaxonomyAdmin(ctx);
		const label = checkedLabel(args.label);
		const color = checkedColor(args.color);
		const doc = await ctx.db
			.query("taxonomies")
			.withIndex("by_key", (q) => q.eq("key", args.key))
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
		await requireTaxonomyAdmin(ctx);
		const doc = await ctx.db
			.query("taxonomies")
			.withIndex("by_key", (q) => q.eq("key", args.key))
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
	args: { key: taxonomyKeyValidator, value: v.string() },
	returns: v.null(),
	handler: async (ctx, { key, value }) => {
		await requireTaxonomyAdmin(ctx);
		const doc = await ctx.db
			.query("taxonomies")
			.withIndex("by_key", (q) => q.eq("key", key))
			.unique();
		if (!doc) throw new ConvexError("Taxonomy not found.");
		if (!doc.items.some((item) => item.value === value))
			throw new ConvexError("Option not found.");
		if (doc.items.length <= 1)
			throw new ConvexError("A taxonomy needs at least one option.");
		// Block while any feedback row still references the value.
		const used =
			key === "status"
				? await ctx.db
						.query("feedback")
						.withIndex("by_status", (q) => q.eq("status", value))
						.take(1)
				: key === "category"
					? await ctx.db
							.query("feedback")
							.withIndex("by_category", (q) => q.eq("category", value))
							.take(1)
					: await ctx.db
							.query("feedback")
							.withIndex("by_priority", (q) => q.eq("priority", value))
							.take(1);
		if (used.length > 0)
			throw new ConvexError(
				"This option is still used by feedback and cannot be removed.",
			);
		await ctx.db.patch("taxonomies", doc._id, {
			items: doc.items.filter((item) => item.value !== value),
		});
		return null;
	},
});
