import { getAuthSessionId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { getSessionUserId } from "../feedback/access";
import { requestOrganizationDeletion } from "../organizations/deletion";
import { projectNames, soleAdminProjects } from "../team/admins";
import { requireCurrentPassword } from "./account";

/**
 * Self-serve account deletion.
 *
 * Any signed-in user can delete their own account (typing their email, or
 * DELETE for accounts without one) after re-authenticating: accounts with a
 * password enter it; OAuth-only accounts need a sign-in from the last
 * REAUTH_WINDOW_MS (a stolen, long-lived session can't delete the account).
 * Refused while they own an organization: an
 * organization must always have an owner, so they transfer ownership or
 * delete it first.
 *
 * Removed: organization memberships and project links (their open feedback
 * returns to the unassigned queue through team.mutations.releaseAssignments),
 * invitation links they created, notification preferences, pending email
 * changes, and the Convex Auth
 * data (accounts with their verification codes, sessions with their refresh
 * tokens, sign-in rate-limit rows) and finally the user document. Comments
 * and activity stay as project history and render as "Former member".
 *
 * Not removed: `authVerifiers` rows have no user or session index; they are
 * short-lived OAuth PKCE verifiers that Convex Auth deletes on use.
 */

const REAUTH_WINDOW_MS = 10 * 60 * 1000;
const SIGN_IN_AGAIN =
	"For your security, sign out and sign in again, then delete your account within 10 minutes.";
const LINK_LIMIT = 200;
const MEMBERSHIP_LIMIT = 100;
const AUTH_BATCH = 200;

/**
 * Deletes up to AUTH_BATCH auth rows for `userId`. Returns true when every
 * account and session (with its codes and refresh tokens) is gone.
 */
async function purgeAuthStep(ctx: MutationCtx, userId: Id<"users">, email: string | null) {
	let budget = AUTH_BATCH;
	const accounts = await ctx.db
		.query("authAccounts")
		.withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
		.take(20);
	for (const account of accounts) {
		const codes = await ctx.db
			.query("authVerificationCodes")
			.withIndex("accountId", (q) => q.eq("accountId", account._id))
			.take(budget);
		for (const code of codes) await ctx.db.delete("authVerificationCodes", code._id);
		budget -= codes.length;
		if (budget <= 0) return false;
		await ctx.db.delete("authAccounts", account._id);
		budget -= 1;
		// Sign-in throttling rows: Convex Auth keys password attempts by the
		// authAccounts `_id` and OTP attempts by the account identifier.
		for (const identifier of [account._id, account.providerAccountId]) {
			const limits = await ctx.db
				.query("authRateLimits")
				.withIndex("identifier", (q) => q.eq("identifier", identifier))
				.take(5);
			for (const limit of limits) await ctx.db.delete("authRateLimits", limit._id);
		}
	}
	if (email) {
		const limits = await ctx.db
			.query("authRateLimits")
			.withIndex("identifier", (q) => q.eq("identifier", email))
			.take(5);
		for (const limit of limits) await ctx.db.delete("authRateLimits", limit._id);
	}
	if (accounts.length === 20) return false;

	const sessions = await ctx.db
		.query("authSessions")
		.withIndex("userId", (q) => q.eq("userId", userId))
		.take(50);
	for (const session of sessions) {
		const tokens = await ctx.db
			.query("authRefreshTokens")
			.withIndex("sessionId", (q) => q.eq("sessionId", session._id))
			.take(budget);
		for (const token of tokens) await ctx.db.delete("authRefreshTokens", token._id);
		budget -= tokens.length;
		if (budget <= 0) return false;
		await ctx.db.delete("authSessions", session._id);
		budget -= 1;
		if (budget <= 0) return false;
	}
	return sessions.length < 50;
}

/** What deleteAccount needs to re-authenticate the caller. */
export const reauthContext = internalQuery({
	args: {},
	returns: v.union(
		v.object({
			userId: v.id("users"),
			passwordEmail: v.union(v.string(), v.null()),
			sessionCreatedAt: v.union(v.number(), v.null()),
		}),
		v.null(),
	),
	handler: async (ctx) => {
		const userId = await getSessionUserId(ctx);
		if (!userId) return null;
		const account = await ctx.db
			.query("authAccounts")
			.withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "password"))
			.first();
		const rawSessionId = await getAuthSessionId(ctx);
		const sessionId = rawSessionId ? ctx.db.normalizeId("authSessions", rawSessionId) : null;
		const session = sessionId ? await ctx.db.get("authSessions", sessionId) : null;
		return {
			userId,
			passwordEmail: account?.providerAccountId ?? null,
			sessionCreatedAt: session?._creationTime ?? null,
		};
	},
});

export const deleteAccount = action({
	args: { confirmation: v.string(), currentPassword: v.optional(v.string()) },
	returns: v.null(),
	handler: async (ctx, { confirmation, currentPassword }) => {
		if (confirmation.length > 320) throw new ConvexError("Type your email address exactly to confirm.");
		const reauth = await ctx.runQuery(internal.users.deletion.reauthContext, {});
		if (!reauth) throw new ConvexError("Sign in to access this workspace.");
		if (reauth.passwordEmail !== null) {
			await requireCurrentPassword(ctx, reauth.userId, reauth.passwordEmail, currentPassword);
		} else if (
			// Only test identities carry no session (Convex Auth always issues one).
			reauth.sessionCreatedAt !== null &&
			Date.now() - reauth.sessionCreatedAt > REAUTH_WINDOW_MS
		) {
			throw new ConvexError(SIGN_IN_AGAIN);
		}
		await ctx.runMutation(internal.users.deletion.performDeletion, {
			userId: reauth.userId,
			confirmation,
		});
		return null;
	},
});

/**
 * The deletion itself, after deleteAccount re-authenticated the caller.
 * Immediate: the account and its auth data are gone when this commits
 * (remaining rows are purged by scheduled continuations).
 */
export const performDeletion = internalMutation({
	args: { userId: v.id("users"), confirmation: v.string() },
	returns: v.null(),
	handler: async (ctx, { userId, confirmation }) => {
		const user = await ctx.db.get("users", userId);
		if (!user) throw new ConvexError("Account not found.");
		const expected = user.email ? user.email.toLowerCase() : "delete";
		if (confirmation.trim().toLowerCase() !== expected)
			throw new ConvexError(
				user.email
					? "Type your email address exactly to confirm."
					: "Type DELETE to confirm.",
			);

		const ownedAll = await ctx.db
			.query("organizations")
			.withIndex("by_ownerId", (q) => q.eq("ownerId", userId))
			.take(20);
		const owned = ownedAll.filter((organization) => organization.deletionRequestedAt === undefined);
		if (owned.length > 0) {
			const names = owned.map((organization) => organization.name).join(", ");
			throw new ConvexError(
				`You own ${names}. Transfer ownership or delete ${owned.length === 1 ? "that organization" : "those organizations"} before deleting your account.`,
			);
		}

		// Organizations already deleted (inside their restore window) are
		// purged now: nobody could restore them once the owner is gone.
		for (const organization of ownedAll)
			if (organization.deletionRequestedAt !== undefined)
				await requestOrganizationDeletion(ctx, organization, { actorId: userId, immediate: true });

		// Project links: their open work returns to the unassigned queue.
		const links = await ctx.db
			.query("projectMembers")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(LINK_LIMIT + 1);
		if (links.length > LINK_LIMIT)
			throw new ConvexError("Leave some projects before deleting this account.");
		// Every project keeps an administrator (team.removeMember enforces the
		// same rule). Nobody else could appoint one afterwards, so refuse and
		// say how to hand the project over.
		const linkedProjects = (
			await Promise.all(links.map((link) => ctx.db.get("projects", link.projectId)))
		).filter((project) => project !== null);
		const orphaned = await soleAdminProjects(ctx, userId, linkedProjects);
		if (orphaned.length > 0)
			throw new ConvexError(
				`You are the only administrator of ${projectNames(orphaned)}. Make another member an administrator there (or invite the organization owner as one) before deleting your account.`,
			);
		for (const link of links) {
			await ctx.db.delete("projectMembers", link._id);
			if (await ctx.db.get("projects", link.projectId))
				await ctx.scheduler.runAfter(0, internal.team.mutations.releaseAssignments, {
					projectId: link.projectId,
					memberId: userId,
					actorId: userId,
				});
		}
		const memberships = await ctx.db
			.query("organizationMembers")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(MEMBERSHIP_LIMIT + 1);
		if (memberships.length > MEMBERSHIP_LIMIT)
			throw new ConvexError("Leave some organizations before deleting this account.");
		for (const membership of memberships)
			await ctx.db.delete("organizationMembers", membership._id);

		const requests = await ctx.db
			.query("emailChangeRequests")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(10);
		for (const request of requests) await ctx.db.delete("emailChangeRequests", request._id);

		await ctx.db.delete("users", userId);
		// Invitation links and auth rows can be numerous: inline first batch,
		// the rest in scheduled continuations.
		const email = user.email ?? null;
		const invitationsDone =
			(await purgeInvitationsStep(ctx, userId)) && (await purgePreferencesStep(ctx, userId));
		const authDone = await purgeAuthStep(ctx, userId, email);
		if (!invitationsDone || !authDone)
			await ctx.scheduler.runAfter(0, internal.users.deletion.purgeRemaining, { userId, email });
		return null;
	},
});

const INVITATION_BATCH = 200;

async function purgeInvitationsStep(ctx: MutationCtx, userId: Id<"users">) {
	const invitations = await ctx.db
		.query("projectInvitations")
		.withIndex("by_createdBy", (q) => q.eq("createdBy", userId))
		.take(INVITATION_BATCH);
	for (const invitation of invitations) await ctx.db.delete("projectInvitations", invitation._id);
	return invitations.length < INVITATION_BATCH;
}

/** Notification preferences (with their unsubscribe tokens), one batch. */
async function purgePreferencesStep(ctx: MutationCtx, userId: Id<"users">) {
	const preferences = await ctx.db
		.query("notificationPreferences")
		.withIndex("by_userId_projectId", (q) => q.eq("userId", userId))
		.take(INVITATION_BATCH);
	for (const preference of preferences)
		await ctx.db.delete("notificationPreferences", preference._id);
	return preferences.length < INVITATION_BATCH;
}

/** Continuation of deleteAccount; reschedules itself until nothing is left. */
export const purgeRemaining = internalMutation({
	args: { userId: v.id("users"), email: v.union(v.string(), v.null()) },
	returns: v.null(),
	handler: async (ctx, { userId, email }) => {
		// A user document with this id again would mean a bug; never touch it.
		if (await ctx.db.get("users", userId)) return null;
		const invitationsDone =
			(await purgeInvitationsStep(ctx, userId)) && (await purgePreferencesStep(ctx, userId));
		const authDone = await purgeAuthStep(ctx, userId, email);
		if (!invitationsDone || !authDone)
			await ctx.scheduler.runAfter(0, internal.users.deletion.purgeRemaining, { userId, email });
		return null;
	},
});
