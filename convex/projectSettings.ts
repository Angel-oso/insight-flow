import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCapability, requireProject } from "./feedback/access";
import { getTaxonomies } from "./taxonomies";
import schema from "./schema";

const settingsChanges = v.object({
	name: v.optional(v.string()),
	description: v.optional(v.string()),
	status: v.optional(schema.tables.projects.validator.fields.status),
	inboxEnabled: v.optional(v.boolean()),
	defaultPriority: v.optional(
		schema.tables.projects.validator.fields.defaultPriority,
	),
});

export const get = query({
	args: { projectSlug: v.string() },
	returns: v.object({ project: schema.doc("projects") }),
	handler: async (ctx, { projectSlug }) => {
		const { project } = await requireProject(ctx, projectSlug);
		return { project };
	},
});

export const update = mutation({
	args: { projectSlug: v.string(), changes: settingsChanges },
	returns: v.null(),
	handler: async (ctx, { projectSlug, changes }) => {
		const { project, member } = await requireProject(ctx, projectSlug);
		requireCapability(member.role, "project.manage");
		if (project.status === "Archived")
			throw new ConvexError("Archived projects cannot be edited.");

		const patch: {
			name?: string;
			description?: string;
			status?: "Active" | "Paused" | "Archived";
			inboxEnabled?: boolean;
			defaultPriority?: string;
			updatedAt: number;
		} = { updatedAt: Date.now() };
		let changed = false;

		if (changes.name !== undefined) {
			const name = changes.name.trim();
			if (name.length === 0 || name.length > 80)
				throw new ConvexError("Give the project a name between 1 and 80 characters.");
			if (name !== project.name) {
				patch.name = name;
				changed = true;
			}
		}
		if (changes.description !== undefined) {
			const description = changes.description.trim();
			if (description.length > 500)
				throw new ConvexError("Keep the description under 500 characters.");
			if (description !== project.description) {
				patch.description = description;
				changed = true;
			}
		}
		if (
			changes.status !== undefined &&
			changes.status !== project.status
		) {
			patch.status = changes.status;
			changed = true;
		}
		if (
			changes.inboxEnabled !== undefined &&
			changes.inboxEnabled !== project.inboxEnabled
		) {
			patch.inboxEnabled = changes.inboxEnabled;
			changed = true;
		}
		if (
			changes.defaultPriority !== undefined &&
			changes.defaultPriority !== project.defaultPriority
		) {
			const { priorities } = await getTaxonomies(ctx);
			if (!priorities.some((entry) => entry.value === changes.defaultPriority)) {
				throw new ConvexError(`Unknown priority: ${changes.defaultPriority}.`);
			}
			patch.defaultPriority = changes.defaultPriority;
			changed = true;
		}

		if (!changed) return null;
		await ctx.db.patch("projects", project._id, patch);
		return null;
	},
});
