import {
	getAuthSessionId,
	getAuthUserId,
	invalidateSessions,
	modifyAccountCredentials,
	retrieveAccount,
} from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { action, internalMutation, internalQuery } from "../_generated/server";

const passwordProvider = "password";

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
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
			.unique();
		return {
			name: user.name ?? null,
			email: user.email ?? null,
			passwordAccountId: account?._id ?? null,
			passwordAccountEmail: account?.providerAccountId ?? null,
		};
	},
});

export const save = internalMutation({
	args: {
		userId: v.id("users"),
		name: v.string(),
		passwordAccountId: v.union(v.id("authAccounts"), v.null()),
		email: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, { userId, name, passwordAccountId, email }) => {
		const user = await ctx.db.get("users", userId);
		if (!user) throw new ConvexError("Account not found.");

		if (email !== undefined) {
			const existingUser = await ctx.db
				.query("users")
				.withIndex("email", (q) => q.eq("email", email))
				.unique();
			if (existingUser && existingUser._id !== userId) {
				throw new ConvexError("This email address is already in use.");
			}
			if (!passwordAccountId) {
				throw new ConvexError("This email is managed by your sign-in provider.");
			}
			const existingAccount = await ctx.db
				.query("authAccounts")
				.withIndex("providerAndAccountId", (q) =>
					q.eq("provider", passwordProvider).eq("providerAccountId", email),
				)
				.unique();
			if (existingAccount && existingAccount._id !== passwordAccountId) {
				throw new ConvexError("This email address is already in use.");
			}
			const passwordAccount = await ctx.db.get("authAccounts", passwordAccountId);
			if (
				!passwordAccount ||
				passwordAccount.userId !== userId ||
				passwordAccount.provider !== passwordProvider
			) {
				throw new ConvexError("Password account not found.");
			}
			await ctx.db.patch(passwordAccountId, { providerAccountId: email });
		}

		await ctx.db.patch("users", userId, {
			name,
			...(email === undefined ? {} : { email }),
		});
		return null;
	},
});

/** Updates the caller's profile and, for password accounts, their credentials. */
export const update = action({
	args: {
		name: v.string(),
		email: v.optional(v.string()),
		currentPassword: v.optional(v.string()),
		newPassword: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Sign in to update your account.");
		const account = await ctx.runQuery(internal.users.account.details, { userId });
		const name = validateName(args.name);
		const email = args.email === undefined ? account.email : validateEmail(args.email);
		const emailChanged = email !== account.email;
		const passwordChanged = Boolean(args.newPassword);

		if (!emailChanged && !passwordChanged && name === account.name) return null;
		if ((emailChanged || passwordChanged) && !account.passwordAccountId) {
			throw new ConvexError(
				"Email and password are managed by your sign-in provider.",
			);
		}
		if (emailChanged && email === null) {
			throw new ConvexError("Enter a valid email address.");
		}
		if (passwordChanged) validateNewPassword(args.newPassword!);

		if (emailChanged || passwordChanged) {
			if (!args.currentPassword || !account.passwordAccountEmail) {
				throw new ConvexError("Enter your current password to save these changes.");
			}
			try {
				const retrieved = await retrieveAccount(ctx, {
					provider: passwordProvider,
					account: {
						id: account.passwordAccountEmail,
						secret: args.currentPassword,
					},
				});
				if (retrieved.user._id !== userId) {
					throw new ConvexError("Current password is incorrect.");
				}
			} catch {
				throw new ConvexError("Current password is incorrect.");
			}
		}

		if (passwordChanged) {
			await modifyAccountCredentials(ctx, {
				provider: passwordProvider,
				account: { id: account.passwordAccountEmail!, secret: args.newPassword! },
			});
		}
		await ctx.runMutation(internal.users.account.save, {
			userId,
			name,
			passwordAccountId: account.passwordAccountId,
			...(emailChanged && email !== null ? { email } : {}),
		});
		if (emailChanged || passwordChanged) {
			const sessionId = await getAuthSessionId(ctx);
			await invalidateSessions(ctx, {
				userId,
				...(sessionId ? { except: [sessionId] } : {}),
			});
		}
		return null;
	},
});
