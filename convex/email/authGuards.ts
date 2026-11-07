import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { TURNSTILE_VERIFY_URL } from "../intake/captcha";
import { appUrl } from "./config";
import { deliverEmail, emailRateLimiter } from "./send";
import { button, escapeHtml, layout, type EmailContent } from "./templates";

/**
 * Abuse guards for the email/password auth flows (convex/auth.ts):
 * captcha before any code is emailed, per-address code delivery and failed
 * verification budgets, and the account-linking rules that keep an
 * unverified password sign-up from touching anybody else's user.
 */

/** Convex Auth's provider id for the email/password accounts. */
export const PASSWORD_PROVIDER = "password";

/** Widget `action` the auth forms render with; checked when Cloudflare echoes it. */
export const AUTH_TURNSTILE_ACTION = "auth";
const VERIFY_TIMEOUT_MS = 10_000;
const CAPTCHA_UNAVAILABLE =
	"Email sign-up and sign-in codes are temporarily unavailable. Please try again later.";
export const CAPTCHA_FAILED =
	"We couldn't verify that you're human. Complete the check and try again.";

/** Same normalization as the account ids: trimmed and lowercase. */
export function normalizeEmail(value: unknown) {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Auth params must carry the email exactly as stored (normalized). Convex
 * Auth counts failed code attempts per raw `params.email`, so accepting
 * variants like " Ada@x.com" would hand an attacker a fresh budget per
 * variant. The client normalizes before sending.
 */
export function requireNormalizedEmail(value: unknown): string {
	const email = normalizeEmail(value);
	if (!email || email !== value || email.length > 254) {
		throw new ConvexError("Enter a valid email address.");
	}
	return email;
}

type SiteverifyResponse = { success?: unknown; action?: unknown; "error-codes"?: unknown };

/**
 * Cloudflare Turnstile check for the auth flows that email a code (sign-up,
 * resend, password reset, sign-in of an unverified account), and for code
 * verification and password sign-in once the address has recent failures
 * (the captcha gates below). It shares the
 * deployment's Turnstile keys with the public intake form and fails CLOSED
 * the same way: without `TURNSTILE_SECRET_KEY` those flows are rejected,
 * unless `INTAKE_CAPTCHA_DISABLED` is exactly "true" (local development and
 * tests only; it turns the captcha off for intake AND auth).
 */
export async function verifyAuthCaptcha(token: unknown) {
	const secret = process.env.TURNSTILE_SECRET_KEY;
	if (!secret) {
		if (process.env.INTAKE_CAPTCHA_DISABLED === "true") return;
		console.error("Auth code request rejected: TURNSTILE_SECRET_KEY is not set.");
		throw new ConvexError(CAPTCHA_UNAVAILABLE);
	}
	if (typeof token !== "string" || !token || token.length > 2048) {
		throw new ConvexError(CAPTCHA_FAILED);
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
	let result: SiteverifyResponse;
	try {
		const response = await fetch(TURNSTILE_VERIFY_URL, {
			method: "POST",
			body: new URLSearchParams({ secret, response: token }),
			signal: controller.signal,
		});
		if (!response.ok) throw new Error(`siteverify responded ${response.status}`);
		result = (await response.json()) as SiteverifyResponse;
	} catch (error) {
		console.error("Turnstile verification unavailable:", error);
		throw new ConvexError(CAPTCHA_FAILED);
	} finally {
		clearTimeout(timer);
	}
	if (result.success !== true) {
		console.warn("Turnstile rejected an auth token:", result["error-codes"]);
		throw new ConvexError(CAPTCHA_FAILED);
	}
	if (typeof result.action === "string" && result.action !== AUTH_TURNSTILE_ACTION) {
		throw new ConvexError(CAPTCHA_FAILED);
	}
}

/**
 * Read-only check of the per-address delivery bucket, done before Convex
 * Auth replaces the outstanding code: a request that could not be emailed
 * must not invalidate the code the owner already has.
 */
export const canSendAuthCode = internalQuery({
	args: { email: v.string() },
	returns: v.boolean(),
	handler: async (ctx, { email }) => {
		const { ok } = await emailRateLimiter.check(ctx, "authCode", { key: normalizeEmail(email) });
		return ok;
	},
});

/**
 * Captcha gates, per normalized address. Each holds one token that the first
 * failure spends; until it refills (30 minutes) or the flow succeeds, every
 * attempt for that address needs a Turnstile token. Legitimate users rarely
 * see the challenge, while a script that wants to burn somebody's budgets
 * (and lock them out) has to solve one captcha per attempt.
 */
const captchaGates = new RateLimiter(components.rateLimiter, {
	// Wrong sign-up verification / password reset codes.
	authCodeCaptcha: { kind: "token bucket", rate: 1, period: 30 * MINUTE, capacity: 1 },
	// Failed password sign-ins (unknown address or wrong password alike).
	passwordCaptcha: { kind: "token bucket", rate: 1, period: 30 * MINUTE, capacity: 1 },
});

/**
 * Read-only check before a code is verified: whether the address still has
 * failed-verification budget, and whether it has recent failures (then the
 * attempt needs a captcha).
 */
export const authCodeGate = internalQuery({
	args: { email: v.string() },
	returns: v.object({ allowed: v.boolean(), captchaRequired: v.boolean() }),
	handler: async (ctx, { email }) => {
		const key = normalizeEmail(email);
		const budget = await emailRateLimiter.check(ctx, "authCodeVerify", { key });
		const gate = await captchaGates.check(ctx, "authCodeCaptcha", { key });
		return { allowed: budget.ok, captchaRequired: !gate.ok };
	},
});

/**
 * Records a wrong code for the address. Called from the auth action in its
 * own transaction (after the failed attempt), so the count persists even
 * though the sign-in itself fails. The outstanding code is never deleted:
 * deleting it let anybody lock the owner out with a few wrong guesses. Once
 * the budget is spent, attempts are refused until a new code goes out
 * (resetAuthCodeBudget), which costs a captcha and a delivery token.
 */
export const recordAuthCodeFailure = internalMutation({
	args: { email: v.string() },
	returns: v.object({ exhausted: v.boolean() }),
	handler: async (ctx, { email }) => {
		const key = normalizeEmail(email);
		await captchaGates.limit(ctx, "authCodeCaptcha", { key });
		const consumed = await emailRateLimiter.limit(ctx, "authCodeVerify", { key });
		const remaining = await emailRateLimiter.check(ctx, "authCodeVerify", { key });
		return { exhausted: !consumed.ok || !remaining.ok };
	},
});

/** A correct code clears the address's failed-verification budget and gate. */
export const clearAuthCodeFailures = internalMutation({
	args: { email: v.string() },
	returns: v.null(),
	handler: async (ctx, { email }) => {
		const key = normalizeEmail(email);
		await emailRateLimiter.reset(ctx, "authCodeVerify", { key });
		await captchaGates.reset(ctx, "authCodeCaptcha", { key });
		return null;
	},
});

/**
 * A new code went out: guessing starts over against it. Clears our failed
 * budget and Convex Auth's own per-address OTP throttle (keyed by the email),
 * which would otherwise keep rejecting the owner's fresh code. The captcha
 * gate stays, so further wrong guesses still need a captcha each.
 */
export const resetAuthCodeBudget = internalMutation({
	args: { email: v.string() },
	returns: v.null(),
	handler: async (ctx, { email }) => {
		const key = normalizeEmail(email);
		await emailRateLimiter.reset(ctx, "authCodeVerify", { key });
		const limits = await ctx.db
			.query("authRateLimits")
			.withIndex("identifier", (q) => q.eq("identifier", key))
			.take(5);
		for (const limit of limits) await ctx.db.delete("authRateLimits", limit._id);
		return null;
	},
});

/** Whether a password sign-in for the address must carry a captcha. */
export const passwordCaptchaRequired = internalQuery({
	args: { email: v.string() },
	returns: v.boolean(),
	handler: async (ctx, { email }) => {
		const gate = await captchaGates.check(ctx, "passwordCaptcha", { key: normalizeEmail(email) });
		return !gate.ok;
	},
});

/**
 * A failed password sign-in (wrong password, unknown address or throttled):
 * from now on sign-ins for the address need a captcha, so scripted guessing
 * can't spend Convex Auth's per-account failure limit and lock the owner out
 * for free. Recorded for unknown addresses too, so the captcha requirement
 * doesn't reveal which addresses have accounts.
 */
export const recordPasswordFailure = internalMutation({
	args: { email: v.string() },
	returns: v.null(),
	handler: async (ctx, { email }) => {
		await captchaGates.limit(ctx, "passwordCaptcha", { key: normalizeEmail(email) });
		return null;
	},
});

/** A correct password lifts the address's captcha requirement. */
export const clearPasswordFailures = internalMutation({
	args: { email: v.string() },
	returns: v.null(),
	handler: async (ctx, { email }) => {
		await captchaGates.reset(ctx, "passwordCaptcha", { key: normalizeEmail(email) });
		return null;
	},
});

/**
 * How long a never-used password sign-up holds its address. Matches the code
 * lifetime: within it the sign-up can still be finished, so another sign-up
 * for the address must not wipe it.
 */
export const PENDING_SIGN_UP_MS = 15 * 60 * 1000;

const signUpState = v.union(
	v.object({ status: v.literal("new") }),
	v.object({ status: v.literal("existing") }),
);

/**
 * Before a new password sign-up, without ever looking at its password:
 * - "new": no password account holds the address (a stale, never-used
 *   sign-up is released first), so the library may create one;
 * - "existing": the address belongs to a verified or used account, or to a
 *   sign-up that can still be finished. The caller answers exactly like a
 *   fresh sign-up, so the response reveals neither the account nor whether
 *   the submitted password matches it.
 * A pending sign-up is only released once it is older than the code
 * lifetime and has no live code, so repeated sign-ups can't wipe a sign-up
 * that its owner is finishing.
 */
export const prepareSignUp = internalMutation({
	args: { email: v.string() },
	returns: signUpState,
	handler: async (ctx, { email }) => {
		const account = await passwordAccount(ctx, normalizeEmail(email));
		if (!account) return { status: "new" as const };
		if (!(await isUnclaimedPasswordAccount(ctx, account))) return { status: "existing" as const };
		const now = Date.now();
		if (now - account._creationTime < PENDING_SIGN_UP_MS) return { status: "existing" as const };
		const codes = await ctx.db
			.query("authVerificationCodes")
			.withIndex("accountId", (q) => q.eq("accountId", account._id))
			.take(10);
		if (codes.some((code) => code.expirationTime > now)) return { status: "existing" as const };
		await releasePasswordSignUp(ctx, account);
		return { status: "new" as const };
	},
});

/**
 * Sent instead of a code when a sign-up names an address that already has
 * an account (or a sign-up in progress). It spends the same per-address
 * delivery token as a code, so the two outcomes look and throttle alike.
 */
export const sendSignUpNotice = internalMutation({
	args: { email: v.string() },
	returns: v.null(),
	handler: async (ctx, { email }) => {
		const key = normalizeEmail(email);
		const limit = await emailRateLimiter.limit(ctx, "authCode", { key });
		if (!limit.ok) {
			throw new ConvexError(
				"Too many codes were requested for this email. Wait a few minutes and try again.",
			);
		}
		const result = await deliverEmail(ctx, { to: key, ...signUpNoticeEmail(appUrl("/login")) });
		if (result === "skipped") {
			throw new ConvexError(
				"We couldn't send the email because email delivery isn't configured yet. Contact your administrator.",
			);
		}
		return null;
	},
});

function signUpNoticeEmail(signInUrl: string): EmailContent {
	const intro =
		"Someone tried to create an InsightFlow account with this email address. It already has an account or a sign-up in progress, so no new account was created and the password they entered was not checked.";
	const followUp =
		"If it was you: sign in, or reset your password from the sign-in page if you forgot it. A sign-up that is waiting for its code can be finished with the code from the earlier email.";
	const footer = "If it wasn't you, you can ignore this email. Nothing changed on your account.";
	return {
		subject: "Someone tried to sign up with your email",
		html: layout({
			preheader: intro,
			body: `<p style="margin:0 0 12px;">${escapeHtml(intro)}</p><p style="margin:0;">${escapeHtml(followUp)}</p>${button(signInUrl, "Go to sign in")}`,
			footer: escapeHtml(footer),
		}),
		text: `${intro}

${followUp}
${signInUrl}

--
${footer}
`,
	};
}

/**
 * An unverified password account whose user was never used (see
 * isUnclaimedUser), or whose user is gone: nobody proved or used the
 * address, so it may be released.
 */
export async function isUnclaimedPasswordAccount(ctx: QueryCtx, account: Doc<"authAccounts">) {
	if (account.provider !== PASSWORD_PROVIDER || account.emailVerified !== undefined) return false;
	const user = await ctx.db.get("users", account.userId);
	return !user || (await isUnclaimedUser(ctx, user, account._id));
}

/** Removes an unclaimed sign-up (check isUnclaimedPasswordAccount first). */
export async function releasePasswordSignUp(ctx: MutationCtx, account: Doc<"authAccounts">) {
	await deleteVerificationCodes(ctx, account._id);
	await ctx.db.delete("authAccounts", account._id);
	if (await ctx.db.get("users", account.userId)) await ctx.db.delete("users", account.userId);
}

async function passwordAccount(ctx: QueryCtx, email: string) {
	return await ctx.db
		.query("authAccounts")
		.withIndex("providerAndAccountId", (q) =>
			q.eq("provider", PASSWORD_PROVIDER).eq("providerAccountId", email),
		)
		.unique();
}

async function deleteVerificationCodes(ctx: MutationCtx, accountId: Id<"authAccounts">) {
	const codes = await ctx.db
		.query("authVerificationCodes")
		.withIndex("accountId", (q) => q.eq("accountId", accountId))
		.take(10);
	for (const code of codes) await ctx.db.delete("authVerificationCodes", code._id);
}

/**
 * A user created by an unverified password sign-up and never used: no
 * verified email, no other sign-in method, no session ever issued (sessions
 * only start after verification), no workspace. Such a user may be removed
 * or merged into the verified owner of the address.
 */
async function isUnclaimedUser(
	ctx: QueryCtx,
	user: Doc<"users">,
	accountId: Id<"authAccounts">,
) {
	if (user.emailVerificationTime !== undefined) return false;
	const accounts = await ctx.db
		.query("authAccounts")
		.withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
		.take(2);
	if (accounts.some((account) => account._id !== accountId)) return false;
	const session = await ctx.db
		.query("authSessions")
		.withIndex("userId", (q) => q.eq("userId", user._id))
		.first();
	if (session) return false;
	const membership = await ctx.db
		.query("organizationMembers")
		.withIndex("by_userId", (q) => q.eq("userId", user._id))
		.first();
	if (membership) return false;
	const owned = await ctx.db
		.query("organizations")
		.withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
		.first();
	return owned === null;
}

/** The single user with this verified email, other than `exceptId`. */
async function verifiedOwner(ctx: QueryCtx, email: string, exceptId?: Id<"users">) {
	const users = await ctx.db
		.query("users")
		.withIndex("email", (q) => q.eq("email", email))
		.filter((q) => q.neq(q.field("emailVerificationTime"), undefined))
		.take(3);
	const others = users.filter((user) => user._id !== exceptId);
	return others.length === 1 ? others[0] : null;
}

type AuthUserArgs = {
	existingUserId: Id<"users"> | null;
	type: "oauth" | "credentials" | "email" | "phone" | "verification";
	profile: Record<string, unknown> & { email?: string; emailVerified?: boolean };
};

function userFields(profile: Record<string, unknown>) {
	const fields: { name?: string; image?: string } = {};
	if (typeof profile.name === "string" && profile.name.trim()) {
		fields.name = profile.name.trim().slice(0, 80);
	}
	if (typeof profile.image === "string" && profile.image) fields.image = profile.image;
	return fields;
}

/**
 * Convex Auth `callbacks.createOrUpdateUser`. Replaces the default, which
 * links an unverified password sign-up to an existing user with the same
 * email and patches that user's profile before the email is verified.
 *
 * - credentials (password sign-up): always a new, separate user. Nothing
 *   existing is linked or patched until the email is verified.
 * - email (a code is being sent): never touches the user.
 * - verification (a code was entered): the email is now proven. If a
 *   different verified user owns the address (e.g. signed up with Google),
 *   the password account moves to that user and the unused sign-up user is
 *   removed; the owner's profile is left as it is. Otherwise the account's
 *   own user is marked verified.
 * - oauth (Google): the existing linked user, else — only when Google
 *   reports the email as verified — the unique verified user with that
 *   email, else a new user. Unverified users never capture a Google
 *   identity, and an unverified Google email never links or verifies.
 */
export async function createOrUpdateAuthUser(
	ctx: MutationCtx,
	args: AuthUserArgs,
): Promise<Id<"users">> {
	const { existingUserId, type, profile } = args;
	const email = normalizeEmail(profile.email) || undefined;

	if (type === "oauth") {
		// Only an address the provider says it verified may link to (or be
		// recorded as verified on) a user; Google reports it as
		// `email_verified`, carried here by the provider's profile().
		const verifiedEmail = profile.emailVerified === true ? email : undefined;
		const linkedId =
			existingUserId ??
			(verifiedEmail ? (await verifiedOwner(ctx, verifiedEmail))?._id ?? null : null);
		const existing = linkedId ? await ctx.db.get("users", linkedId) : null;
		const data = {
			...userFields(profile),
			...(verifiedEmail ? { email: verifiedEmail } : {}),
			...(verifiedEmail
				? { emailVerificationTime: existing?.emailVerificationTime ?? Date.now() }
				: {}),
		};
		if (existing) {
			await ctx.db.patch("users", existing._id, data);
			return existing._id;
		}
		// A new user with an unverified address keeps it for display only;
		// without emailVerificationTime nothing ever links to it.
		return await ctx.db.insert("users", { ...data, ...(email && !verifiedEmail ? { email } : {}) });
	}

	if (type === "verification") {
		if (!existingUserId) throw new Error("A verified code must belong to an account.");
		const user = await ctx.db.get("users", existingUserId);
		if (!user) throw new Error(`User ${existingUserId} no longer exists.`);
		const verifiedEmail = profile.emailVerified === true ? email : undefined;
		if (verifiedEmail) {
			const owner = await verifiedOwner(ctx, verifiedEmail, user._id);
			const account = await ctx.db
				.query("authAccounts")
				.withIndex("userIdAndProvider", (q) =>
					q.eq("userId", user._id).eq("provider", PASSWORD_PROVIDER),
				)
				.first();
			if (owner && account && (await isUnclaimedUser(ctx, user, account._id))) {
				// Convex Auth re-points the account to the returned user.
				await ctx.db.delete("users", user._id);
				return owner._id;
			}
		}
		await ctx.db.patch("users", user._id, {
			...(verifiedEmail ? { email: verifiedEmail } : {}),
			emailVerificationTime: user.emailVerificationTime ?? Date.now(),
		});
		return user._id;
	}

	// "email" / "phone": a code is about to be sent to an existing account.
	if (existingUserId) return existingUserId;

	// "credentials" (password sign-up), or a code for a brand-new account.
	return await ctx.db.insert("users", {
		...userFields(profile),
		...(email ? { email } : {}),
	});
}
