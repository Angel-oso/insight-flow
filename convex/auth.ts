import Google from "@auth/core/providers/google";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import {
	convexAuth,
	invalidateSessions,
	modifyAccountCredentials,
	retrieveAccount,
	signInViaProvider,
	type GenericActionCtxWithAuthConfig,
} from "@convex-dev/auth/server";
import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import { ConvexError, type Value } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import {
	createOrUpdateAuthUser,
	PASSWORD_PROVIDER,
	requireNormalizedEmail,
	verifyAuthCaptcha,
} from "./email/authGuards";

/**
 * Convex Auth configuration: Google OAuth + email/password.
 *
 * Google credentials come from the deployment env vars AUTH_GOOGLE_ID and
 * AUTH_GOOGLE_SECRET (Auth.js convention). They are passed explicitly so a
 * missing key fails fast here instead of deep inside the OAuth redirect.
 *
 * Password accounts verify their email with an 8-digit code before the
 * first session is issued, and can reset the password with a code. Accounts
 * created before verification existed have no verified email, so their
 * next password sign-in sends a code first.
 *
 * Hardening on top of Convex Auth's Password provider (authorizePassword):
 * - emails must arrive normalized, so the library's per-email failed-code
 *   limit can't be multiplied with " Ada@x.com"-style variants, and we keep
 *   our own per-address failed-code budget; a spent budget refuses further
 *   attempts until a new code is sent (codes are never deleted for it, so a
 *   stranger can't lock the owner out of their code);
 * - every flow that emails a code requires a Turnstile token (params
 *   `turnstileToken`) and a free delivery token for the address;
 * - after a failure for an address, code verification and password sign-in
 *   for it require a Turnstile token too (captcha gates in authGuards), so
 *   scripts can't spend the per-address budgets and lock the owner out;
 * - a sign-in for an unknown address runs a dummy password hash, so it
 *   takes about as long as a wrong password;
 * - a sign-up never checks the password of an existing account: a taken
 *   address gets the same "code sent" response (its owner gets a notice
 *   email), so sign-up is neither a password oracle outside the lockout
 *   nor an account-existence oracle;
 * - code verification after sign-in is bound to the account's password;
 * - users are linked/patched only after the email is verified
 *   (createOrUpdateAuthUser in convex/email/authGuards.ts).
 *
 * Codes go out through convex/email (Brevo, or the Convex log
 * with EMAIL_DEV_LOG=true).
 */
const deploymentEnv =
	typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);
const googleClientId = deploymentEnv.AUTH_GOOGLE_ID;
const googleClientSecret = deploymentEnv.AUTH_GOOGLE_SECRET;

const CODE_TTL_SECONDS = 15 * 60;
const CODE_PATTERN = /^\d{8}$/;
const PASSWORD_RULE = "Password must be between 8 and 128 characters.";
const TOO_MANY_CODES =
	"Too many codes were requested for this email. Wait a few minutes and try again.";
const TOO_MANY_WRONG_CODES = "Too many incorrect codes. Request a new code to try again.";
// Access tokens are short-lived so a revoked session stops working soon even
// in functions that don't check the session row (requireUserId does).
const JWT_DURATION_MS = 15 * 60 * 1000;

const random: RandomReader = {
	read(bytes) {
		crypto.getRandomValues(bytes);
	},
};

/** 8-digit email OTP provider used by the Password provider's flows. */
function emailCode(id: string, purpose: "verify" | "reset") {
	return Email({
		id,
		maxAge: CODE_TTL_SECONDS,
		async generateVerificationToken() {
			return generateRandomString(random, "0123456789", 8);
		},
		// Codes are short, so they are only valid together with the exact
		// (normalized) address they were sent to. Requiring the exact string
		// also keeps every attempt on the same Convex Auth rate-limit key.
		async authorize(params, account) {
			if (typeof params.email !== "string" || params.email !== account.providerAccountId) {
				throw new Error("The code does not match this email address.");
			}
		},
		// Convex Auth passes the action ctx as a second argument.
		async sendVerificationRequest({ identifier, token, expires }, ctx?: unknown) {
			const actionCtx = ctx as ActionCtx | undefined;
			if (!actionCtx) throw new Error("Missing action context for email delivery.");
			await actionCtx.runMutation(internal.email.send.sendAuthCode, {
				purpose,
				email: identifier,
				code: token,
				expiresAt: expires.getTime(),
			});
		},
	});
}

const verifyProvider = emailCode("password-verify", "verify");
const resetProvider = emailCode("password-reset", "reset");

function checkPassword(password: unknown): string {
	if (typeof password !== "string" || password.length < 8 || password.length > 128) {
		throw new ConvexError(PASSWORD_RULE);
	}
	return password;
}

type Params = Partial<Record<string, Value | undefined>>;
type PasswordCrypto = {
	hashSecret: (secret: string) => Promise<string>;
	verifySecret: (secret: string, hash: string) => Promise<boolean>;
};
type AuthCtx = GenericActionCtxWithAuthConfig<DataModel>;
type Authorized = { userId: Id<"users">; sessionId?: Id<"authSessions"> } | null;
type Authorize = (params: Params, ctx: AuthCtx) => Promise<Authorized>;

const passwordProvider = Password<DataModel>({
	verify: verifyProvider,
	reset: resetProvider,
	profile(params) {
		const email = requireNormalizedEmail(params.email);
		const rawName = typeof params.name === "string" ? params.name.trim() : "";
		return {
			email,
			...(rawName ? { name: rawName.slice(0, 80) } : {}),
		};
	},
	validatePasswordRequirements(password: string) {
		checkPassword(password);
	},
});

// Convex Auth materializes a credentials provider from its `options`, so
// that is where the Password flows live and where we wrap them.
const passwordOptions = (
	passwordProvider as unknown as { options: { authorize: Authorize; crypto: PasswordCrypto } }
).options;
const libraryAuthorize = passwordOptions.authorize;
passwordOptions.authorize = authorizePassword;

/** Throws (without touching the outstanding code) when the address's delivery budget is spent. */
async function requireCodeDelivery(ctx: AuthCtx, email: string) {
	if (!(await ctx.runQuery(internal.email.authGuards.canSendAuthCode, { email }))) {
		throw new ConvexError(TOO_MANY_CODES);
	}
}

/**
 * Captcha + delivery budget, then a fresh code for the account. Pass
 * `captchaChecked` when this request's token was already verified (tokens
 * are single-use, a second siteverify would fail).
 */
async function sendVerificationCode(
	ctx: AuthCtx,
	accountId: Id<"authAccounts">,
	email: string,
	params: Params,
	captchaChecked = false,
) {
	if (!captchaChecked) await verifyAuthCaptcha(params.turnstileToken);
	await requireCodeDelivery(ctx, email);
	await signInViaProvider(ctx, verifyProvider, { accountId, params });
	await ctx.runMutation(internal.email.authGuards.resetAuthCodeBudget, { email });
}

let dummyPasswordHash: string | null = null;

/**
 * Spends about one password hash, like a wrong password does, so a missing
 * account (or a throttled one) doesn't answer measurably faster.
 */
async function equalizePasswordTiming(secret: string) {
	const { hashSecret, verifySecret } = passwordOptions.crypto;
	if (dummyPasswordHash === null) {
		dummyPasswordHash = await hashSecret(generateRandomString(random, "abcdefghijklmnop", 16));
		return;
	}
	await verifySecret(secret.slice(0, 128), dummyPasswordHash);
}

/** Password check for sign-in, behind the address's captcha gate. */
async function signInWithPassword(ctx: AuthCtx, email: string, params: Params) {
	const secret = typeof params.password === "string" ? params.password : "";
	const captchaChecked = await ctx.runQuery(internal.email.authGuards.passwordCaptchaRequired, {
		email,
	});
	if (captchaChecked) await verifyAuthCaptcha(params.turnstileToken);
	try {
		const retrieved = await retrieveAccount(ctx, {
			provider: PASSWORD_PROVIDER,
			account: { id: email, secret },
		});
		if (captchaChecked) {
			await ctx.runMutation(internal.email.authGuards.clearPasswordFailures, { email });
		}
		return { ...retrieved, captchaChecked };
	} catch (error) {
		await ctx.runMutation(internal.email.authGuards.recordPasswordFailure, { email });
		const message = error instanceof Error ? error.message : "";
		// A wrong password already cost a hash; everything else didn't.
		if (message !== "InvalidSecret") await equalizePasswordTiming(secret);
		throw error;
	}
}

/**
 * Runs a code verification under our own per-address failure budget and
 * captcha gate. The failure is recorded from this action in its own
 * transaction, so it persists although the sign-in fails.
 */
async function verifyCode(
	ctx: AuthCtx,
	email: string,
	params: Params,
	run: () => Promise<{ userId: Id<"users">; sessionId: Id<"authSessions"> } | null>,
	captchaChecked = false,
) {
	if (typeof params.code !== "string" || !CODE_PATTERN.test(params.code)) {
		throw new Error("Invalid code");
	}
	const gate = await ctx.runQuery(internal.email.authGuards.authCodeGate, { email });
	if (!gate.allowed) throw new ConvexError(TOO_MANY_WRONG_CODES);
	// After a wrong code for this address, every attempt needs a captcha.
	if (gate.captchaRequired && !captchaChecked) await verifyAuthCaptcha(params.turnstileToken);
	let result: Awaited<ReturnType<typeof run>> = null;
	try {
		result = await run();
	} catch {
		result = null;
	}
	if (!result) {
		await ctx.runMutation(internal.email.authGuards.recordAuthCodeFailure, { email });
		throw new Error("Invalid code");
	}
	await ctx.runMutation(internal.email.authGuards.clearAuthCodeFailures, { email });
	return result;
}

async function authorizePassword(params: Params, ctx: AuthCtx): Promise<Authorized> {
	const email = requireNormalizedEmail(params.email);
	switch (params.flow) {
		case "signUp": {
			checkPassword(params.password);
			await verifyAuthCaptcha(params.turnstileToken);
			await requireCodeDelivery(ctx, email);
			// Never check the password against an existing account here: the
			// library would answer "already exists" vs. a session, an oracle
			// outside the sign-in lockout. A taken address gets the same
			// response as a fresh sign-up; its owner is emailed a notice
			// instead of a code. (A stale, never-used sign-up is released.)
			const state = await ctx.runMutation(internal.email.authGuards.prepareSignUp, { email });
			if (state.status === "existing") {
				// A fresh sign-up spends a password hash; so does this.
				await equalizePasswordTiming(params.password as string);
				await ctx.runMutation(internal.email.authGuards.sendSignUpNotice, { email });
				return null;
			}
			return await libraryAuthorize(params, ctx);
		}
		case "signIn": {
			const { account, user, captchaChecked } = await signInWithPassword(ctx, email, params);
			if (account.emailVerified) return { userId: user._id };
			// Correct password, unverified email: a code goes out first.
			await sendVerificationCode(ctx, account._id, email, params, captchaChecked);
			return null;
		}
		case "email-verification": {
			// Bound to the password, so a code from somebody else's sign-up
			// for this address can't sign the owner into that account. The
			// password check sits behind the same captcha gate as sign-in.
			const { account, captchaChecked } = await signInWithPassword(ctx, email, params);
			if (params.code === undefined) {
				await sendVerificationCode(ctx, account._id, email, params, captchaChecked);
				return null;
			}
			const result = await verifyCode(
				ctx,
				email,
				params,
				() => signInViaProvider(ctx, verifyProvider, { accountId: account._id, params }),
				captchaChecked,
			);
			if (result.userId !== (await currentAccountUserId(ctx, email))) {
				throw new Error("Invalid code");
			}
			return result;
		}
		case "reset": {
			await verifyAuthCaptcha(params.turnstileToken);
			// Same response whether or not the account exists, and whether or
			// not a code could go out (only existing accounts get that far).
			try {
				if (!(await ctx.runQuery(internal.email.authGuards.canSendAuthCode, { email }))) {
					console.warn("Password reset code not sent: delivery limit reached.");
					return null;
				}
				const { account } = await retrieveAccount(ctx, {
					provider: PASSWORD_PROVIDER,
					account: { id: email },
				});
				await signInViaProvider(ctx, resetProvider, { accountId: account._id, params });
				await ctx.runMutation(internal.email.authGuards.resetAuthCodeBudget, { email });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (message !== "InvalidAccountId") {
					console.error("Password reset code not sent:", error);
				}
			}
			return null;
		}
		case "reset-verification": {
			const newPassword = checkPassword(params.newPassword);
			await retrieveAccount(ctx, { provider: PASSWORD_PROVIDER, account: { id: email } });
			const result = await verifyCode(ctx, email, params, () =>
				signInViaProvider(ctx, resetProvider, { params }),
			);
			// Read after verification: verifying can move the account to the
			// verified owner of the address.
			if (result.userId !== (await currentAccountUserId(ctx, email))) {
				throw new Error("Invalid code");
			}
			await modifyAccountCredentials(ctx, {
				provider: PASSWORD_PROVIDER,
				account: { id: email, secret: newPassword },
			});
			await invalidateSessions(ctx, { userId: result.userId, except: [result.sessionId] });
			return result;
		}
		default:
			throw new Error(
				'Missing `flow` param, it must be one of "signUp", "signIn", "reset", ' +
					'"reset-verification" or "email-verification"!',
			);
	}
}

async function currentAccountUserId(ctx: AuthCtx, email: string) {
	const { account } = await retrieveAccount(ctx, {
		provider: PASSWORD_PROVIDER,
		account: { id: email },
	});
	return account.userId;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		Google({
			...(googleClientId ? { clientId: googleClientId } : {}),
			...(googleClientSecret ? { clientSecret: googleClientSecret } : {}),
			// The default profile() drops `email_verified`; createOrUpdateAuthUser
			// only links or verifies an address Google says it verified.
			profile(google) {
				return {
					id: google.sub,
					name: google.name,
					email: google.email,
					image: google.picture,
					emailVerified: google.email_verified === true,
				};
			},
		}),
		passwordProvider,
	],
	jwt: { durationMs: JWT_DURATION_MS },
	callbacks: {
		// Never link or patch an existing user before the email is verified.
		async createOrUpdateUser(ctx, args) {
			return await createOrUpdateAuthUser(ctx as unknown as MutationCtx, {
				existingUserId: args.existingUserId as Id<"users"> | null,
				type: args.type,
				profile: args.profile,
			});
		},
	},
});
