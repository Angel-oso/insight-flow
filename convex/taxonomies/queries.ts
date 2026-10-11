import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { requireProject } from "../feedback/access";
import { ensureTaxonomies, getTaxonomies, taxonomiesValidator } from "./lib";

export const list = query({
	args: { projectSlug: v.string() },
	returns: taxonomiesValidator,
	handler: async (ctx, { projectSlug }) => {
		const { project } = await requireProject(ctx, projectSlug);
		return await getTaxonomies(ctx, project.organizationId);
	},
});

// Internal backfill helper for organizations without taxonomy docs.
export const ensureDefaults = internalMutation({
	args: { organizationId: v.id("organizations") },
	returns: taxonomiesValidator,
	handler: async (ctx, { organizationId }) => {
		await ensureTaxonomies(ctx, organizationId);
		return await getTaxonomies(ctx, organizationId);
	},
});
