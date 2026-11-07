import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { action, internalMutation, query, type QueryCtx } from "../_generated/server";
import { isProjectDeleted } from "../access/roles";
import { insertFeedback } from "../feedback/create";
import { enforceRateLimit } from "../rateLimits";
import { getTaxonomies } from "../taxonomies/lib";
import { verifyCaptcha } from "./captcha";

const CLOSED_MESSAGE = "This feedback link is not accepting submissions.";

const submissionFields = {
	projectSlug: v.string(),
	title: v.string(),
	description: v.string(),
	category: v.string(),
	senderName: v.optional(v.string()),
	senderEmail: v.optional(v.string()),
};

/** The project behind a slug, only while it accepts public submissions. */
async function acceptingProject(ctx: QueryCtx, projectSlug: string): Promise<Doc<"projects"> | null> {
	const project = await ctx.db
		.query("projects")
		.withIndex("by_slug", (q) => q.eq("slug", projectSlug))
		.unique();
	if (!project || project.status !== "Active" || !project.inboxEnabled) return null;
	return (await isProjectDeleted(ctx, project)) ? null : project;
}

/**
 * Public form metadata. Unknown, paused, archived and closed links all return
 * the same `{ accepting: false }`, so the endpoint never reveals whether a
 * slug exists or what a closed project is called.
 */
export const form = query({
	args: { projectSlug: v.string() },
	returns: v.union(
		v.object({ accepting: v.literal(false) }),
		v.object({
			accepting: v.literal(true),
			name: v.string(),
			description: v.string(),
			categories: v.array(v.object({ value: v.string(), label: v.string(), description: v.optional(v.string()) })),
		}),
	),
	handler: async (ctx, { projectSlug }) => {
		const project = await acceptingProject(ctx, projectSlug);
		if (!project) return { accepting: false as const };
		const { categories } = await getTaxonomies(ctx, project.organizationId);
		return {
			accepting: true as const,
			name: project.name,
			description: project.description,
			categories: [...categories].sort((a, b) => a.rank - b.rank).map((item) => ({
				value: item.value,
				label: item.label,
				...(item.description !== undefined ? { description: item.description } : {}),
			})),
		};
	},
});

/**
 * Anonymous submission. Runs as an action so the Turnstile token can be
 * verified with Cloudflare before anything touches the database; the write
 * itself happens in `record`, which validates and rate-limits atomically.
 */
export const submit = action({
	args: {
		...submissionFields,
		website: v.optional(v.string()),
		captchaToken: v.optional(v.string()),
	},
	returns: v.object({ reference: v.string() }),
	handler: async (ctx, { website, captchaToken, ...fields }): Promise<{ reference: string }> => {
		// Honeypot: bots that fill the hidden field get a plausible receipt.
		if (website) return { reference: `received-${Date.now().toString(36)}` };
		await verifyCaptcha(captchaToken);
		return await ctx.runMutation(internal.intake.public.record, fields);
	},
});

export const record = internalMutation({
	args: submissionFields,
	returns: v.object({ reference: v.string() }),
	handler: async (ctx, { projectSlug, ...fields }) => {
		const project = await acceptingProject(ctx, projectSlug);
		if (!project) throw new ConvexError(CLOSED_MESSAGE);
		await enforceRateLimit(ctx, "intakeProject", project._id);
		const email = (fields.senderEmail ?? "").trim().toLowerCase();
		if (email) await enforceRateLimit(ctx, "intakeSender", `${project._id}:${email}`);
		const feedbackId = await insertFeedback(ctx, {
			project, ...fields, actorId: null, message: "Received through the public link",
		});
		return { reference: String(feedbackId) };
	},
});
