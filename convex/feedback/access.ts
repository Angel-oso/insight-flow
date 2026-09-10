import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { hasCapability, type Capability } from "../../lib/auth/permissions";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Verified caller identity. The user id always comes from the Convex Auth
 * session — never from a client-supplied argument — so a caller cannot
 * impersonate another member by passing their id.
 */
export async function requireUserId(ctx: QueryCtx): Promise<Id<"users">> {
	const userId = await getAuthUserId(ctx);
	if (!userId) throw new ConvexError("Sign in to access this workspace.");
	return userId as Id<"users">;
}

/**
 * Project access for the signed-in caller: the project must exist, the
 * caller must belong to its organization, and that membership must reach
 * the project through an explicit project link.
 */
export async function requireProject(ctx: QueryCtx, slug: string) {
	const userId = await requireUserId(ctx);
	const project = await ctx.db
		.query("projects")
		.withIndex("by_slug", (q) => q.eq("slug", slug))
		.unique();
	if (!project) throw new ConvexError("Project not found.");
	const organization = await ctx.db.get(
		"organizations",
		project.organizationId,
	);
	if (!organization) throw new ConvexError("Project not found.");
	const member = await ctx.db
		.query("memberships")
		.withIndex("by_organizationId_userId", (q) =>
			q.eq("organizationId", organization._id).eq("userId", userId),
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
	return { project, member, organization };
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
 * Projects stay small in this release; the explicit cap keeps every reader
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
			"This workspace supports up to 200 feedback items per project.",
		);
	return items;
}
