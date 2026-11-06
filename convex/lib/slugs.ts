import type { MutationCtx } from "../_generated/server";

const MAX_SLUG_LENGTH = 48;
const SUFFIX_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** URL-safe slug from a display name ("Café Ünïcode!" -> "cafe-unicode"). */
export function slugify(name: string) {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, MAX_SLUG_LENGTH)
		.replace(/-+$/, "");
}

function randomSuffix(length: number) {
	let suffix = "";
	for (let i = 0; i < length; i += 1) {
		suffix += SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)];
	}
	return suffix;
}

/**
 * Globally unique slug for `table`, derived from `name`. Routes depend on
 * global uniqueness, so a taken slug gets a short random suffix
 * ("website-k3f9") instead of an error that would reveal (or let someone
 * squat) another tenant's name. Returns null when the name has no letters
 * or numbers.
 */
export async function uniqueSlug(
	ctx: MutationCtx,
	table: "organizations" | "projects",
	name: string,
) {
	const base = slugify(name);
	if (!base) return null;
	const kind = table === "organizations" ? "organization" : "project";
	const isTaken = async (slug: string) => {
		const live =
			table === "organizations"
				? await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", slug)).first()
				: await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
		if (live !== null) return true;
		// Purged workspaces keep their slug forever (see retireSlug).
		const retired = await ctx.db
			.query("retiredSlugs")
			.withIndex("by_slug_kind", (q) => q.eq("slug", slug).eq("kind", kind))
			.first();
		return retired !== null;
	};
	if (!(await isTaken(base))) return base;
	// 32^4 ≈ 1M combinations per base; fall back to longer suffixes in the
	// (astronomically unlikely) event of repeated collisions.
	for (const length of [4, 4, 4, 6, 6, 8]) {
		const candidate = `${base}-${randomSuffix(length)}`;
		if (!(await isTaken(candidate))) return candidate;
	}
	throw new Error("Could not allocate a unique slug.");
}

/**
 * Records a purged project's or organization's slug so `uniqueSlug` never
 * hands it out again. Call right before the document is deleted.
 */
export async function retireSlug(
	ctx: MutationCtx,
	kind: "organization" | "project",
	slug: string,
) {
	const existing = await ctx.db
		.query("retiredSlugs")
		.withIndex("by_slug_kind", (q) => q.eq("slug", slug).eq("kind", kind))
		.first();
	if (!existing) await ctx.db.insert("retiredSlugs", { slug, kind, retiredAt: Date.now() });
}
