import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getFinalStatuses, getTaxonomies } from "../taxonomies/lib";
import { insertFeedbackRow } from "./store";
import { scheduleCriticalAlert } from "../notifications/critical";
import { scheduleWebhookDeliveries } from "../integrations/webhooks";

/**
 * Shared, transactional creation for public intake and team logging.
 * Projects have no item cap: every reader paginates or reads aggregates.
 */
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

	const now = Date.now();
	// A workflow whose entry status is final (e.g. a pure log) completes on
	// arrival; the store writes completedAt into the aggregates too.
	const completesOnArrival = (await getFinalStatuses(ctx, input.project.organizationId)).has(status);
	const feedbackId = await insertFeedbackRow(ctx, {
		projectId: input.project._id,
		title, description, category: input.category, priority, status,
		assigneeId: null,
		sender: name || email ? { name, email } : null,
		receivedAt: now,
		updatedAt: now,
		...(completesOnArrival ? { completedAt: now } : {}),
	});
	await ctx.db.insert("activities", {
		projectId: input.project._id,
		feedbackId,
		actorId: input.actorId,
		type: "received",
		message: input.message,
		createdAt: now,
	});
	await scheduleCriticalAlert(ctx, feedbackId);
	await scheduleWebhookDeliveries(ctx, feedbackId);
	return feedbackId;
}
