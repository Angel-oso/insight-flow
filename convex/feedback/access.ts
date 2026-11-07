import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { hasCapability, type Capability } from "../../lib/auth/permissions";
import { resolveProjectAccess } from "../access/roles";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Same text for missing projects and projects the caller can't open. */
const PROJECT_NOT_FOUND = "Project not found.";

/**
 * The caller's user id, or null when signed out or when the token's session
 * was revoked. Access tokens stay valid until they expire, so after a
 * password reset/change or email change (which delete the other sessions)
 * the session row is what tells a revoked token apart. Convex Auth always
 * issues `userId|sessionId` subjects; only test identities lack a session.
 */
export async function getSessionUserId(
	ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
	const userId = await getAuthUserId(ctx);
	if (!userId) return null;
	const rawSessionId: string | null | undefined = await getAuthSessionId(ctx);
	if (!rawSessionId) return userId as Id<"users">;
	const sessionId = ctx.db.normalizeId("authSessions", rawSessionId);
	const session = sessionId ? await ctx.db.get("authSessions", sessionId) : null;
	if (!session || session.userId !== userId) return null;
	return userId as Id<"users">;
}

/**
 * Verified caller identity. The user id always comes from the Convex Auth
 * session — never from a client-supplied argument — so a caller cannot
 * impersonate another member by passing their id.
 */
export async function requireUserId(
	ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
	const userId = await getSessionUserId(ctx);
	if (!userId) throw new ConvexError("Sign in to access this workspace.");
	return userId;
}

/**
 * Project access for the signed-in caller: the project must exist, the
 * caller must belong to its organization and have the right project grant.
 * Every refusal reads "Project not found.", so slugs can't be probed for
 * existence.
 */
export async function requireProject(ctx: QueryCtx, slug: string) {
	const userId = await requireUserId(ctx);
	const project = await ctx.db
		.query("projects")
		.withIndex("by_slug", (q) => q.eq("slug", slug))
		.unique();
	// Projects and organizations being deleted read as missing.
	if (!project || project.deletionRequestedAt !== undefined)
		throw new ConvexError(PROJECT_NOT_FOUND);
	const organization = await ctx.db.get(
		"organizations",
		project.organizationId,
	);
	if (!organization || organization.deletionRequestedAt !== undefined)
		throw new ConvexError(PROJECT_NOT_FOUND);
	const access = await resolveProjectAccess(ctx, userId, project._id);
	if (
		!access ||
		!hasCapability(access.permissions, "project.view") ||
		!hasCapability(access.permissions, "feedback.view")
	)
		throw new ConvexError(PROJECT_NOT_FOUND);
	return { project, access, organization };
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
	permissions: Parameters<typeof hasCapability>[0],
	capability: Capability,
) {
	if (!hasCapability(permissions, capability))
		throw new ConvexError("You cannot make this change.");
}

/**
 * Upper bound for project member lists read in one query (assignee pickers,
 * team roster, workload). Explicit so readers never silently truncate.
 */
export const PROJECT_MEMBER_LIMIT = 200;
