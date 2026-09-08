import { ConvexError } from "convex/values";
import { hasCapability, type Capability } from "../../lib/auth/permissions";
import type { Id } from "../_generated/dataModel";
import { env, type QueryCtx } from "../_generated/server";

/** Shared demo identity, deliberately NOT an authenticated user session. */
export async function requireProject(ctx: QueryCtx, slug: string) {
	if (env.DEMO_ENABLED !== "true")
		throw new ConvexError("The demo workspace is unavailable.");
	const project = await ctx.db
		.query("projects")
		.withIndex("by_slug", (q) => q.eq("slug", slug))
		.unique();
	if (!project) throw new ConvexError("Project not found.");
	const organization = await ctx.db.get(
		"organizations",
		project.organizationId,
	);
	if (!organization || organization.slug !== "acme-studio-demo")
		throw new ConvexError("Project not available in this demo.");
	const member = await ctx.db
		.query("memberships")
		.withIndex("by_organizationId_userId", (q) =>
			q
				.eq("organizationId", organization._id)
				.eq("userId", organization.ownerId),
		)
		.unique();
	if (!member || !hasCapability(member.role, "feedback.view"))
		throw new ConvexError("Feedback access denied.");
	const access = await ctx.db
		.query("projectMembers")
		.withIndex("by_projectId_membershipId", (q) =>
			q.eq("projectId", project._id).eq("membershipId", member._id),
		)
		.unique();
	if (!access) throw new ConvexError("Project access denied.");
	return { project, member };
}

export async function requireFeedback(
	ctx: QueryCtx,
	projectSlug: string,
	feedbackId: Id<"feedback">,
) {
	const access = await requireProject(ctx, projectSlug);
	const item = await ctx.db.get("feedback", feedbackId);
	if (!item || item.projectId !== access.project._id)
		throw new ConvexError("Feedback not found in this project.");
	return { ...access, item };
}

export function requireCapability(
	role: Parameters<typeof hasCapability>[0],
	capability: Capability,
) {
	if (!hasCapability(role, capability))
		throw new ConvexError("You cannot make this change.");
}

/**
 * Bounded project feedback listing shared by workspace and overview reads.
 * Projects stay small in this demo; the explicit cap keeps every reader
 * honest instead of silently truncating.
 */
export async function listProjectFeedback(
	ctx: QueryCtx,
	projectId: Id<"projects">,
) {
	const items = await ctx.db
		.query("feedback")
		.withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", projectId))
		.order("desc")
		.take(201);
	if (items.length > 200)
		throw new ConvexError(
			"This demo supports up to 200 feedback items per project.",
		);
	return items;
}
