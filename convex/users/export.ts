import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { ConvexError, v, type GenericValidator } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveProjectAccess } from "../access/roles";
import { requireUserId } from "../feedback/access";

/**
 * Self-service personal data export (GDPR access/portability). Every query
 * returns only the signed-in caller's own data; the client pages through
 * each section and saves the result as one JSON file.
 *
 * Third-party personal data is left out: feedback sender names/emails,
 * other members, and secrets (password hashes, unsubscribe tokens).
 *
 * Feedback rows are live team data, so their content (title, description,
 * status, ...) is exported only while the caller can still open the item
 * (`feedback.view` in a project not marked for deletion). Without access,
 * only the caller's own link to the item is exported: its id, project,
 * date and how they relate to it.
 */

const MAX_PAGE = 100;
const ACCOUNT_LIMIT = 20;
const MEMBERSHIP_LIMIT = 100;
const PROJECT_LIMIT = 200;
const ROLE_LIMIT = 10;

function pageOptions(options: PaginationOptions) {
	if (options.numItems < 1 || options.numItems > MAX_PAGE)
		throw new ConvexError(`Request between 1 and ${MAX_PAGE} items per page.`);
	return options;
}

async function roleNames(ctx: QueryCtx, roleIds: Id<"roles">[]) {
	const roles = await Promise.all(
		roleIds.slice(0, ROLE_LIMIT).map((roleId) => ctx.db.get("roles", roleId)),
	);
	return roles.flatMap((role) => (role ? [role.name] : []));
}

const feedbackRelation = v.union(v.literal("created"), v.literal("assigned"));

const feedbackItem = v.union(
	v.object({
		access: v.literal("current"),
		relation: feedbackRelation,
		feedbackId: v.id("feedback"),
		projectId: v.id("projects"),
		title: v.string(),
		description: v.string(),
		category: v.string(),
		priority: v.string(),
		status: v.string(),
		receivedAt: v.number(),
		updatedAt: v.number(),
		completedAt: v.union(v.number(), v.null()),
	}),
	// The caller no longer has access: only their own contribution.
	v.object({
		access: v.literal("revoked"),
		relation: feedbackRelation,
		feedbackId: v.id("feedback"),
		projectId: v.id("projects"),
		date: v.number(),
	}),
);

type FeedbackRelation = "created" | "assigned";

/**
 * Per-page memo of "can the caller still view feedback in this project".
 * Pages hold at most MAX_PAGE rows, so the number of access checks is
 * bounded by the page size.
 */
function feedbackViewAccess(ctx: QueryCtx, userId: Id<"users">) {
	const cache = new Map<Id<"projects">, Promise<boolean>>();
	return (projectId: Id<"projects">) => {
		let allowed = cache.get(projectId);
		if (!allowed) {
			allowed = resolveProjectAccess(ctx, userId, projectId).then(
				(access) => !!access && hasCapability(access.permissions, "feedback.view"),
			);
			cache.set(projectId, allowed);
		}
		return allowed;
	};
}

function exportFeedback(
	item: Doc<"feedback">,
	relation: FeedbackRelation,
	canView: boolean,
	date: number,
) {
	if (!canView)
		return {
			access: "revoked" as const,
			relation,
			feedbackId: item._id,
			projectId: item.projectId,
			date,
		};
	return {
		access: "current" as const,
		relation,
		feedbackId: item._id,
		projectId: item.projectId,
		title: item.title,
		description: item.description,
		category: item.category,
		priority: item.priority,
		status: item.status,
		receivedAt: item.receivedAt,
		updatedAt: item.updatedAt,
		completedAt: item.completedAt ?? null,
	};
}

function pageResult<T extends GenericValidator>(item: T) {
	return v.object({ page: v.array(item), isDone: v.boolean(), continueCursor: v.string() });
}

/** Profile, sign-in methods, memberships and preferences (all bounded). */
export const profile = query({
	args: {},
	returns: v.object({
		user: v.object({
			id: v.id("users"),
			name: v.union(v.string(), v.null()),
			email: v.union(v.string(), v.null()),
			image: v.union(v.string(), v.null()),
			emailVerifiedAt: v.union(v.number(), v.null()),
			createdAt: v.number(),
		}),
		signInMethods: v.array(
			v.object({ provider: v.string(), email: v.union(v.string(), v.null()) }),
		),
		organizations: v.array(
			v.object({
				organizationId: v.id("organizations"),
				name: v.union(v.string(), v.null()),
				roles: v.array(v.string()),
				isOwner: v.boolean(),
			}),
		),
		projects: v.array(
			v.object({
				projectId: v.id("projects"),
				name: v.union(v.string(), v.null()),
				role: v.union(v.string(), v.null()),
				joinedAt: v.number(),
			}),
		),
		notificationPreferences: v.array(
			v.object({
				projectId: v.id("projects"),
				criticalAlerts: v.boolean(),
				weeklyDigest: v.boolean(),
				updatedAt: v.number(),
			}),
		),
		pendingEmailChange: v.union(v.object({ email: v.string(), expiresAt: v.number() }), v.null()),
	}),
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const user = await ctx.db.get("users", userId);
		if (!user) throw new ConvexError("Account not found.");

		const accounts = await ctx.db
			.query("authAccounts")
			.withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
			.take(ACCOUNT_LIMIT);
		const memberships = await ctx.db
			.query("organizationMembers")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(MEMBERSHIP_LIMIT);
		const organizations = await Promise.all(
			memberships.map(async (membership) => {
				const organization = await ctx.db.get("organizations", membership.organizationId);
				return {
					organizationId: membership.organizationId,
					name: organization?.name ?? null,
					roles: await roleNames(ctx, membership.roleIds),
					isOwner: organization?.ownerId === userId,
				};
			}),
		);
		const links = await ctx.db
			.query("projectMembers")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(PROJECT_LIMIT);
		const projects = await Promise.all(
			links.map(async (link) => {
				const project = await ctx.db.get("projects", link.projectId);
				const role = link.roleId ? await ctx.db.get("roles", link.roleId) : null;
				return {
					projectId: link.projectId,
					name: project?.name ?? null,
					role: role?.name ?? null,
					joinedAt: link.joinedAt,
				};
			}),
		);
		const preferences = await ctx.db
			.query("notificationPreferences")
			.withIndex("by_userId_projectId", (q) => q.eq("userId", userId))
			.take(PROJECT_LIMIT);
		const pending = await ctx.db
			.query("emailChangeRequests")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.first();

		return {
			user: {
				id: user._id,
				name: user.name ?? null,
				email: user.email ?? null,
				image: user.image ?? null,
				emailVerifiedAt: user.emailVerificationTime ?? null,
				createdAt: user._creationTime,
			},
			signInMethods: accounts.map((account) => ({
				provider: account.provider,
				// Password accounts sign in with their email; OAuth ids stay out.
				email: account.provider === "password" ? account.providerAccountId : null,
			})),
			organizations,
			projects,
			notificationPreferences: preferences.map((preference) => ({
				projectId: preference.projectId,
				criticalAlerts: preference.criticalAlerts,
				weeklyDigest: preference.weeklyDigest,
				updatedAt: preference.updatedAt,
			})),
			pendingEmailChange: pending ? { email: pending.email, expiresAt: pending.expiresAt } : null,
		};
	},
});

/** Internal notes the caller wrote, oldest first. */
export const comments = query({
	args: { paginationOpts: paginationOptsValidator },
	returns: pageResult(
		v.object({
			commentId: v.id("comments"),
			feedbackId: v.id("feedback"),
			projectId: v.union(v.id("projects"), v.null()),
			body: v.string(),
			createdAt: v.number(),
		}),
	),
	handler: async (ctx, { paginationOpts }) => {
		const userId = await requireUserId(ctx);
		const result = await ctx.db
			.query("comments")
			.withIndex("by_authorId_createdAt", (q) => q.eq("authorId", userId))
			.paginate(pageOptions(paginationOpts));
		const page = await Promise.all(
			result.page.map(async (comment) => ({
				commentId: comment._id,
				feedbackId: comment.feedbackId,
				projectId: (await ctx.db.get("feedback", comment.feedbackId))?.projectId ?? null,
				body: comment.body,
				createdAt: comment.createdAt,
			})),
		);
		return { page, isDone: result.isDone, continueCursor: result.continueCursor };
	},
});

/** Feedback the caller logged for the team (still existing items; content only while they can view it). */
export const createdFeedback = query({
	args: { paginationOpts: paginationOptsValidator },
	returns: pageResult(feedbackItem),
	handler: async (ctx, { paginationOpts }) => {
		const userId = await requireUserId(ctx);
		const result = await ctx.db
			.query("activities")
			.withIndex("by_actorId_type_createdAt", (q) =>
				q.eq("actorId", userId).eq("type", "received"),
			)
			.paginate(pageOptions(paginationOpts));
		const canView = feedbackViewAccess(ctx, userId);
		const items = await Promise.all(
			result.page.map(async (activity) => {
				const item = activity.feedbackId
					? await ctx.db.get("feedback", activity.feedbackId)
					: null;
				if (!item) return null;
				return exportFeedback(item, "created", await canView(item.projectId), activity.createdAt);
			}),
		);
		return {
			page: items.flatMap((item) => (item ? [item] : [])),
			isDone: result.isDone,
			continueCursor: result.continueCursor,
		};
	},
});

/** Feedback currently assigned to the caller (content only while they can view it). */
export const assignedFeedback = query({
	args: { paginationOpts: paginationOptsValidator },
	returns: pageResult(feedbackItem),
	handler: async (ctx, { paginationOpts }) => {
		const userId = await requireUserId(ctx);
		const result = await ctx.db
			.query("feedback")
			.withIndex("by_assigneeId_receivedAt", (q) => q.eq("assigneeId", userId))
			.paginate(pageOptions(paginationOpts));
		const canView = feedbackViewAccess(ctx, userId);
		const page = await Promise.all(
			result.page.map(async (item) =>
				exportFeedback(item, "assigned", await canView(item.projectId), item.receivedAt),
			),
		);
		return {
			page,
			isDone: result.isDone,
			continueCursor: result.continueCursor,
		};
	},
});

/** The caller's own activity log entries (status changes, notes, edits). */
export const activity = query({
	args: { paginationOpts: paginationOptsValidator },
	returns: pageResult(
		v.object({
			projectId: v.id("projects"),
			feedbackId: v.union(v.id("feedback"), v.null()),
			type: v.string(),
			message: v.string(),
			createdAt: v.number(),
		}),
	),
	handler: async (ctx, { paginationOpts }) => {
		const userId = await requireUserId(ctx);
		const result = await ctx.db
			.query("activities")
			.withIndex("by_actorId_type_createdAt", (q) => q.eq("actorId", userId))
			.paginate(pageOptions(paginationOpts));
		return {
			page: result.page.map((entry) => ({
				projectId: entry.projectId,
				feedbackId: entry.feedbackId ?? null,
				type: entry.type,
				message: entry.message,
				createdAt: entry.createdAt,
			})),
			isDone: result.isDone,
			continueCursor: result.continueCursor,
		};
	},
});
