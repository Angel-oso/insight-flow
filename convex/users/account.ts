import {
	getAuthSessionId,
	invalidateSessions,
	modifyAccountCredentials,
	retrieveAccount,
} from "@convex-dev/auth/server";
import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import { sha256 } from "@oslojs/crypto/sha2";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
	action,
	internalMutation,
	internalQuery,
	mutation,
	type ActionCtx,
	type MutationCtx,
} from "../_generated/server";
import { requireUserId } from "../feedback/access";
import { isUnclaimedPasswordAccount, releasePasswordSignUp } from "../email/authGuards";
import { appUrl } from "../email/config";
import { deliverEmail, emailRateLimiter } from "../email/send";
import { authCodeEmail, emailChangedNotice } from "../email/templates";

const passwordProvider = "password";
const EMAIL_CHANGE_TTL_MS = 15 * 60 * 1000;
const EMAIL_CHANGE_MAX_ATTEMPTS = 5;

const random: RandomReader = {
	read(bytes) {
		crypto.getRandomValues(bytes);
	},
};

export function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function hashCode(code: string) {
	return Array.from(sha256(new TextEncoder().encode(code)))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function validateName(name: string) {
	const normalized = name.trim();
	if (!normalized || normalized.length > 80) {
		throw new ConvexError("Name must be between 1 and 80 characters.");
	}
	return normalized;
}

function validateEmail(email: string) {
	const normalized = normalizeEmail(email);
	if (
		normalized.length > 254 ||
		!/^\S+@\S+\.\S+$/.test(normalized)
	) {
		throw new ConvexError("Enter a valid email address.");
	}
	return normalized;
}

function validateNewPassword(password: string) {
	if (password.length < 8 || password.length > 128) {
		throw new ConvexError("Password must be between 8 and 128 characters.");
	}
}

/**
 * Makes `email` free for `userId`, or reports that somebody else holds it.
 * Only proof counts: another user with a verified email, or another
 * password account that was verified or used, keeps the address. Unverified
 * holders can't squat it: a never-used password sign-up is released (its
 * account id has to move to the caller), and an unverified display email
 * (e.g. an unverified Google address) is ignored, as everywhere else.
 * Nothing is deleted unless the whole address is free.
 */
async function claimEmailFor(ctx: MutationCtx, userId: Id<"users">, email: string) {
	const verifiedUsers = await ctx.db
		.query("users")
		.withIndex("email", (q) => q.eq("email", email))
		.filter((q) => q.neq(q.field("emailVerificationTime"), undefined))
		.take(2);
	if (verifiedUsers.some((user) => user._id !== userId)) return false;
	const accounts = await ctx.db
		.query("authAccounts")
		.withIndex("providerAndAccountId", (q) =>
			q.eq("provider", passwordProvider).eq("providerAccountId", email),
		)
		.take(2);
	const others = accounts.filter((account) => account.userId !== userId);
	for (const account of others) {
		if (!(await isUnclaimedPasswordAccount(ctx, account))) return false;
	}
	for (const account of others) await releasePasswordSignUp(ctx, account);
	return true;
}

export const details = internalQuery({
	args: { userId: v.id("users") },
	returns: v.object({
		name: v.union(v.string(), v.null()),
		email: v.union(v.string(), v.null()),
		passwordAccountId: v.union(v.id("authAccounts"), v.null()),
		passwordAccountEmail: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, { userId }) => {
		const user = await ctx.db.get("users", userId);
		if (!user) throw new ConvexError("Account not found.");
		const account = await ctx.db
			.query("authAccounts")
			.withIndex("userIdAndProvider", (q) =>
				q.eq("userId", userId).eq("provider", passwordProvider),
			)
			.first();
		return {
			name: user.name ?? null,
			email: user.email ?? null,
			passwordAccountId: account?._id ?? null,
			passwordAccountEmail: account?.providerAccountId ?? null,
		};
	},
});

export const save = internalMutation({
	args: { userId: v.id("users"), name: v.string() },
	returns: v.null(),
	handler: async (ctx, { userId, name }) => {
		const user = await ctx.db.get("users", userId);
		if (!user) throw new ConvexError("Account not found.");
		await ctx.db.patch("users", userId, { name });
		return null;
	},
});

/** Signed-in caller of an action, refusing tokens of revoked sessions. */
export async function requireActionUserId(
	ctx: ActionCtx,
	message = "Sign in to update your account.",
): Promise<Id<"users">> {
	const userId: Id<"users"> | null = await ctx.runQuery(internal.users.queries.activeUserId, {});
	if (!userId) throw new ConvexError(message);
	return userId;
}

/** Re-authentication with the account's password (counts toward Convex Auth's lockout). */
export async function requireCurrentPassword(
	ctx: ActionCtx,
	userId: Id<"users">,
	accountEmail: string | null,
	currentPassword: string | undefined,
) {
	if (!currentPassword || !accountEmail) {
		throw new ConvexError("Enter your current password to save these changes.");
	}
	if (currentPassword.length > 128) throw new ConvexError("Current password is incorrect.");
	try {
		const retrieved = await retrieveAccount(ctx, {
			provider: passwordProvider,
			account: { id: accountEmail, secret: currentPassword },
		});
		if (retrieved.user._id !== userId) throw new Error("Mismatched account");
	} catch {
		throw new ConvexError("Current password is incorrect.");
	}
}

/**
 * Updates the caller's name and, for password accounts, the password.
 * The sign-in email changes only through `requestEmailChange` +
 * `confirmEmailChange`, which prove ownership of the new address.
 */
export const update = action({
	args: {
		name: v.string(),
		currentPassword: v.optional(v.string()),
		newPassword: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await requireActionUserId(ctx);
		const account = await ctx.runQuery(internal.users.account.details, { userId });
		const name = validateName(args.name);
		const passwordChanged = Boolean(args.newPassword);

		if (!passwordChanged && name === account.name) return null;
		if (passwordChanged) {
			if (!account.passwordAccountId) {
				throw new ConvexError("Your password is managed by your sign-in provider.");
			}
			validateNewPassword(args.newPassword!);
			await requireCurrentPassword(
				ctx,
				userId,
				account.passwordAccountEmail,
				args.currentPassword,
			);
			await modifyAccountCredentials(ctx, {
				provider: passwordProvider,
				account: { id: account.passwordAccountEmail!, secret: args.newPassword! },
			});
		}
		if (name !== account.name) {
			await ctx.runMutation(internal.users.account.save, { userId, name });
		}
		if (passwordChanged) {
			const sessionId = await getAuthSessionId(ctx);
			await invalidateSessions(ctx, {
				userId,
				...(sessionId ? { except: [sessionId] } : {}),
			});
		}
		return null;
	},
});

export const createEmailChange = internalMutation({
	args: { userId: v.id("users"), email: v.string(), code: v.string() },
	returns: v.null(),
	handler: async (ctx, { userId, email, code }) => {
		// No "already in use" check here: answering it before the caller
		// proves they own the address would be an account-existence oracle
		// (and a thrown error would also roll back the rate-limit token, so
		// probing would be free). applyEmailChange reports "taken" only after
		// the code sent to that address was entered.
		const limit = await emailRateLimiter.limit(ctx, "emailChangeCode", { key: userId });
		if (!limit.ok) {
			throw new ConvexError("Too many codes requested. Wait a few minutes and try again.");
		}
		const existing = await ctx.db
			.query("emailChangeRequests")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(10);
		for (const request of existing) await ctx.db.delete("emailChangeRequests", request._id);
		const expiresAt = Date.now() + EMAIL_CHANGE_TTL_MS;
		await ctx.db.insert("emailChangeRequests", {
			userId,
			email,
			codeHash: hashCode(code),
			expiresAt,
			attempts: 0,
		});
		const result = await deliverEmail(ctx, {
			to: email,
			...authCodeEmail({ purpose: "email-change", code, expires: new Date(expiresAt) }),
		});
		if (result === "skipped") {
			throw new ConvexError(
				"We couldn't send the email because email delivery isn't configured yet.",
			);
		}
		return null;
	},
});

/**
 * Step 1 of an email change: re-authenticate with the current password and
 * email an 8-digit code to the new address. Nothing changes yet.
 */
export const requestEmailChange = action({
	args: { email: v.string(), currentPassword: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await requireActionUserId(ctx);
		const account = await ctx.runQuery(internal.users.account.details, { userId });
		if (!account.passwordAccountId) {
			throw new ConvexError("Your email is managed by your sign-in provider.");
		}
		const email = validateEmail(args.email);
		if (email === account.email && email === account.passwordAccountEmail) {
			throw new ConvexError("This is already your email address.");
		}
		await requireCurrentPassword(ctx, userId, account.passwordAccountEmail, args.currentPassword);
		const code = generateRandomString(random, "0123456789", 8);
		await ctx.runMutation(internal.users.account.createEmailChange, { userId, email, code });
		return null;
	},
});

const applyResult = v.union(
	v.object({ status: v.literal("ok"), previousEmail: v.union(v.string(), v.null()), email: v.string() }),
	v.object({
		status: v.union(
			v.literal("missing"),
			v.literal("expired"),
			v.literal("invalid"),
			v.literal("locked"),
			v.literal("taken"),
		),
	}),
);

type ApplyResult = typeof applyResult.type;

/**
 * Applies a pending email change when `code` matches. Never throws for a
 * wrong code so the attempt counter commits.
 */
export const applyEmailChange = internalMutation({
	args: { userId: v.id("users"), code: v.string() },
	returns: applyResult,
	handler: async (ctx, { userId, code }) => {
		const request = await ctx.db
			.query("emailChangeRequests")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.first();
		if (!request) return { status: "missing" as const };
		if (request.expiresAt < Date.now()) {
			await ctx.db.delete("emailChangeRequests", request._id);
			return { status: "expired" as const };
		}
		if (request.codeHash !== hashCode(code.trim())) {
			const attempts = request.attempts + 1;
			if (attempts >= EMAIL_CHANGE_MAX_ATTEMPTS) {
				await ctx.db.delete("emailChangeRequests", request._id);
				return { status: "locked" as const };
			}
			await ctx.db.patch("emailChangeRequests", request._id, { attempts });
			return { status: "invalid" as const };
		}
		await ctx.db.delete("emailChangeRequests", request._id);
		if (!(await claimEmailFor(ctx, userId, request.email))) {
			return { status: "taken" as const };
		}
		const user = await ctx.db.get("users", userId);
		const account = await ctx.db
			.query("authAccounts")
			.withIndex("userIdAndProvider", (q) =>
				q.eq("userId", userId).eq("provider", passwordProvider),
			)
			.first();
		if (!user || !account) return { status: "missing" as const };

		const now = Date.now();
		await ctx.db.patch("authAccounts", account._id, {
			providerAccountId: request.email,
			emailVerified: request.email,
		});
		await ctx.db.patch("users", userId, {
			email: request.email,
			emailVerificationTime: now,
		});
		// Pending sign-in codes were issued for the old address.
		const staleCodes = await ctx.db
			.query("authVerificationCodes")
			.withIndex("accountId", (q) => q.eq("accountId", account._id))
			.take(10);
		for (const stale of staleCodes) await ctx.db.delete("authVerificationCodes", stale._id);

		const previousEmail = user.email ?? null;
		if (previousEmail && previousEmail !== request.email) {
			await deliverEmail(ctx, {
				to: previousEmail,
				...emailChangedNotice({ newEmail: request.email, supportUrl: appUrl("/login") }),
			});
		}
		return { status: "ok" as const, previousEmail, email: request.email };
	},
});

/** Step 2 of an email change: the code proves the caller owns the new address. */
export const confirmEmailChange = action({
	args: { code: v.string() },
	returns: v.object({ email: v.string() }),
	handler: async (ctx, { code }): Promise<{ email: string }> => {
		const userId = await requireActionUserId(ctx);
		if (!/^\d{8}$/.test(code.trim())) {
			throw new ConvexError("Enter the 8-digit code from the email.");
		}
		const result: ApplyResult = await ctx.runMutation(internal.users.account.applyEmailChange, {
			userId,
			code,
		});
		switch (result.status) {
			case "ok": {
				const sessionId = await getAuthSessionId(ctx);
				await invalidateSessions(ctx, {
					userId,
					...(sessionId ? { except: [sessionId] } : {}),
				});
				return { email: result.email };
			}
			case "invalid":
				throw new ConvexError("That code is not correct. Check the email and try again.");
			case "locked":
				throw new ConvexError("Too many incorrect codes. Request a new code to try again.");
			case "expired":
				throw new ConvexError("That code has expired. Request a new one.");
			case "taken":
				throw new ConvexError("This email address is already in use.");
			default:
				throw new ConvexError("There is no pending email change. Request a new code.");
		}
	},
});

export const cancelEmailChange = mutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const requests = await ctx.db
			.query("emailChangeRequests")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(10);
		for (const request of requests) await ctx.db.delete("emailChangeRequests", request._id);
		return null;
	},
});
