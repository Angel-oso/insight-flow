import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getTaxonomies } from "../taxonomies/lib";
import { PROJECT_FEEDBACK_LIMIT } from "./access";

/** Shared, transactional creation for public intake and team logging. */
/** Whether a project can take one more item without breaking its readers. */
export async function hasInboxCapacity(ctx: QueryCtx, projectId: Id<"projects">) {
	const existing = await ctx.db
		.query("feedback")
		.withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", projectId))
		.take(PROJECT_FEEDBACK_LIMIT);
	return existing.length < PROJECT_FEEDBACK_LIMIT;
}

export async function insertFeedback(ctx: MutationCtx, input: {
	project: Doc<"projects">;
	title: string;
	description: string;
	category: string;
	priority?: string;
	senderName?: string;
	senderEmail?: string;
	actorId: Id<"users"> | null;
	message: string;
}) {
	const title = input.title.trim();
	const description = input.description.trim();
	const name = (input.senderName ?? "").trim();
	const email = (input.senderEmail ?? "").trim().toLowerCase();
	if (title.length < 3 || title.length > 120)
		throw new ConvexError("Give your feedback a title between 3 and 120 characters.");
	if (description.length < 10 || description.length > 5000)
		throw new ConvexError("Write a description between 10 and 5,000 characters.");
	if (name.length > 80)
		throw new ConvexError("Keep your name to 80 characters or fewer.");
	if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
		throw new ConvexError("Enter a valid email address of 254 characters or fewer.");

	const { statuses, categories, priorities } = await getTaxonomies(ctx, input.project.organizationId);
	if (!categories.some((item) => item.value === input.category))
		throw new ConvexError("Choose a category from this project's feedback form.");
	const status = [...statuses].sort((a, b) => a.rank - b.rank)[0]?.value;
	const preferredPriority = input.priority ?? input.project.defaultPriority;
	if (input.priority !== undefined && !priorities.some((item) => item.value === input.priority))
		throw new ConvexError("Choose a valid priority for this project.");
	const priority = priorities.find((item) => item.value === preferredPriority)?.value
		?? [...priorities].sort((a, b) => a.rank - b.rank)[0]?.value;
	if (status === undefined || priority === undefined)
		throw new ConvexError("This project needs a status and priority before it can receive feedback.");

	// Every project view reads at most PROJECT_FEEDBACK_LIMIT items, so intake
	// stops there instead of letting anonymous traffic break the team's views.
	if (!(await hasInboxCapacity(ctx, input.project._id)))
		throw new ConvexError(`This project's inbox has reached its ${PROJECT_FEEDBACK_LIMIT}-item limit.`);

	const now = Date.now();
	const feedbackId = await ctx.db.insert("feedback", {
		projectId: input.project._id,
		title, description, category: input.category, priority, status,
		assigneeId: null,
		sender: name || email ? { name, email } : null,
		receivedAt: now,
		updatedAt: now,
	});
	await ctx.db.insert("activities", {
		projectId: input.project._id,
		feedbackId,
		actorId: input.actorId,
		type: "received",
		message: input.message,
		createdAt: now,
	});
	return feedbackId;
}
