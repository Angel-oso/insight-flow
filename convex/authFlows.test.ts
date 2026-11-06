/** Email/password auth flows end to end (convex/auth.ts + convex/email/authGuards.ts). */
import { exportPKCS8, generateKeyPair } from "jose";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { newConvexTest } from "../test/convex-test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createOrUpdateAuthUser } from "./email/authGuards";

const modules = import.meta.glob("./**/*.ts");
type T = ReturnType<typeof newConvexTest>;
type Params = Record<string, string>;

let jwtPrivateKey = "";
let logs: string[] = [];

beforeAll(async () => {
	const { privateKey } = await generateKeyPair("RS256", { extractable: true });
	jwtPrivateKey = await exportPKCS8(privateKey);
});
beforeEach(() => {
	logs = [];
	vi.stubEnv("EMAIL_DEV_LOG", "true");
	vi.stubEnv("SITE_URL", "http://localhost:3000");
	vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211");
	vi.stubEnv("JWT_PRIVATE_KEY", jwtPrivateKey);
	vi.stubEnv("TURNSTILE_SECRET_KEY", "");
	vi.stubEnv("INTAKE_CAPTCHA_DISABLED", "true");
	vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
		logs.push(args.map(String).join(" "));
	});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "debug").mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function signIn(t: T, params: Params) {
	return t.action(api.auth.signIn, { provider: "password", params });
}

/** Latest code emailed (logged) to `email`. */
function lastCode(email: string) {
	const line = logs.filter((entry) => entry.includes(`to=${email} `)).at(-1);
	const code = line ? /\b(\d{8})\b/.exec(line)?.[1] : undefined;
	if (!code) throw new Error(`No code was sent to ${email}`);
	return code;
}

function wrongCode(code: string) {
	return code === "00000000" ? "11111111" : "00000000";
}

async function signUp(t: T, email: string, password: string, name = "Ada") {
	const result = await signIn(t, { flow: "signUp", email, password, name });
	expect(result.tokens).toBeNull();
	return lastCode(email);
}

async function userByEmail(t: T, email: string) {
	return await t.run(async (ctx) =>
		ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", email))
			.collect(),
	);
}

async function passwordAccount(t: T, email: string) {
	return await t.run(async (ctx) =>
		ctx.db
			.query("authAccounts")
			.withIndex("providerAndAccountId", (q) =>
				q.eq("provider", "password").eq("providerAccountId", email),
			)
			.unique(),
	);
}

/** A user that signed up with Google (verified email). */
async function googleUser(t: T, email: string, name: string) {
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", { email, name, emailVerificationTime: Date.now() });
		await ctx.db.insert("authAccounts", { userId, provider: "google", providerAccountId: `g-${email}` });
		return userId;
	});
}

test("sign-up sends a code and the code starts a session", async () => {
	const t = newConvexTest(modules);
	const code = await signUp(t, "ada@example.com", "password123");
	const verified = await signIn(t, {
		flow: "email-verification",
		email: "ada@example.com",
		password: "password123",
		code,
	});
	expect(verified.tokens?.token).toBeTruthy();
	const [user] = await userByEmail(t, "ada@example.com");
	expect(user.emailVerificationTime).toBeDefined();
	expect(user.name).toBe("Ada");
});

test("emails that are not normalized are rejected in every flow", async () => {
	const t = newConvexTest(modules);
	const code = await signUp(t, "ada@example.com", "password123");
	for (const email of ["Ada@example.com", " ada@example.com", "ada@example.com "]) {
		await expect(
			signIn(t, { flow: "signUp", email, password: "password123" }),
		).rejects.toThrow(/valid email/);
		await expect(
			signIn(t, { flow: "email-verification", email, password: "password123", code }),
		).rejects.toThrow(/valid email/);
		await expect(signIn(t, { flow: "reset", email })).rejects.toThrow(/valid email/);
		// The provider-less code path: a variant can never redeem the code.
		const direct = await t.action(api.auth.signIn, { params: { email, code } });
		expect(direct.tokens ?? null).toBeNull();
	}
	// The exact address still works with the same code.
	const verified = await signIn(t, {
		flow: "email-verification",
		email: "ada@example.com",
		password: "password123",
		code,
	});
	expect(verified.tokens?.token).toBeTruthy();
});

test("wrong codes are counted per address; a spent budget waits for a new code", async () => {
	const t = newConvexTest(modules);
	const code = await signUp(t, "ada@example.com", "password123");
	const attempt = (value: string) =>
		signIn(t, {
			flow: "email-verification",
			email: "ada@example.com",
			password: "password123",
			code: value,
		});
	for (let i = 0; i < 5; i++) {
		await expect(attempt(wrongCode(code))).rejects.toThrow(/Invalid code/);
	}
	// The failures persisted although every attempt threw: even the right
	// code is refused now, but it is NOT deleted (that let strangers lock
	// the owner out of their code).
	await expect(attempt(code)).rejects.toThrow(/Too many incorrect codes/);
	const account = await passwordAccount(t, "ada@example.com");
	const codes = await t.run(async (ctx) =>
		ctx.db
			.query("authVerificationCodes")
			.withIndex("accountId", (q) => q.eq("accountId", account!._id))
			.collect(),
	);
	expect(codes).toHaveLength(1);

	// Requesting a new code (signing in to the unverified account) reopens
	// verification for that code.
	await signIn(t, { flow: "signIn", email: "ada@example.com", password: "password123" });
	const fresh = lastCode("ada@example.com");
	expect((await attempt(fresh)).tokens?.token).toBeTruthy();
});

test("a password reset is not blocked by somebody else's wrong codes", async () => {
	const t = newConvexTest(modules);
	const signupCode = await signUp(t, "ada@example.com", "password123");
	await signIn(t, {
		flow: "email-verification",
		email: "ada@example.com",
		password: "password123",
		code: signupCode,
	});
	await signIn(t, { flow: "reset", email: "ada@example.com" });
	const attackerCode = lastCode("ada@example.com");
	for (let i = 0; i < 5; i++) {
		await expect(
			signIn(t, {
				flow: "reset-verification",
				email: "ada@example.com",
				code: wrongCode(attackerCode),
				newPassword: "attacker-pass",
			}),
		).rejects.toThrow(/Invalid code/);
	}
	// The owner asks for a new code and resets normally.
	await signIn(t, { flow: "reset", email: "ada@example.com" });
	const reset = await signIn(t, {
		flow: "reset-verification",
		email: "ada@example.com",
		code: lastCode("ada@example.com"),
		newPassword: "new-password-1",
	});
	expect(reset.tokens?.token).toBeTruthy();
});

test("a correct code clears the failure budget", async () => {
	const t = newConvexTest(modules);
	const code = await signUp(t, "ada@example.com", "password123");
	const params = { flow: "email-verification", email: "ada@example.com", password: "password123" };
	for (let i = 0; i < 3; i++) {
		await expect(signIn(t, { ...params, code: wrongCode(code) })).rejects.toThrow(/Invalid code/);
	}
	expect((await signIn(t, { ...params, code })).tokens?.token).toBeTruthy();
});

test("code verification is bound to the account password", async () => {
	const t = newConvexTest(modules);
	const code = await signUp(t, "ada@example.com", "password123");
	await expect(
		signIn(t, { flow: "email-verification", email: "ada@example.com", password: "other-password", code }),
	).rejects.toThrow(/InvalidSecret/);
	await expect(
		signIn(t, { flow: "email-verification", email: "ada@example.com", code }),
	).rejects.toThrow(/InvalidSecret/);
});

test("an unverified sign-up never links to or renames an existing user", async () => {
	const t = newConvexTest(modules);
	const ownerId = await googleUser(t, "owner@example.com", "Real Owner");
	await signUp(t, "owner@example.com", "attacker-pass", "Hacked");

	const owner = await t.run(async (ctx) => ctx.db.get("users", ownerId));
	expect(owner?.name).toBe("Real Owner");
	const account = await passwordAccount(t, "owner@example.com");
	expect(account?.userId).not.toBe(ownerId);
	const ownerAccounts = await t.run(async (ctx) =>
		ctx.db
			.query("authAccounts")
			.withIndex("userIdAndProvider", (q) => q.eq("userId", ownerId))
			.collect(),
	);
	expect(ownerAccounts.map((a) => a.provider)).toEqual(["google"]);

	// Google sign-in of the owner still resolves to the owner, not the squatter.
	const googleId = await t.run(async (ctx) =>
		createOrUpdateAuthUser(ctx, {
			existingUserId: null,
			type: "oauth",
			profile: { email: "owner@example.com", name: "Real Owner", emailVerified: true },
		}),
	);
	expect(googleId).toBe(ownerId);
});

test("the real owner can sign up over a squatted address and is linked after verifying", async () => {
	const t = newConvexTest(modules);
	const ownerId = await googleUser(t, "owner@example.com", "Real Owner");
	const squatterCode = await signUp(t, "owner@example.com", "attacker-pass", "Hacked");
	const squatterUserId = (await passwordAccount(t, "owner@example.com"))!.userId;

	// The squatter's sign-up holds the address only while its code lives.
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(Date.now() + 16 * 60 * 1000);
	const code = await signUp(t, "owner@example.com", "owner-password", "Owner");
	expect(code).not.toBe(squatterCode);
	// The squatter's sign-up was released.
	expect(await t.run(async (ctx) => ctx.db.get("users", squatterUserId))).toBeNull();

	const verified = await signIn(t, {
		flow: "email-verification",
		email: "owner@example.com",
		password: "owner-password",
		code,
	});
	expect(verified.tokens?.token).toBeTruthy();
	const account = await passwordAccount(t, "owner@example.com");
	expect(account?.userId).toBe(ownerId);
	expect(account?.emailVerified).toBe("owner@example.com");
	const users = await userByEmail(t, "owner@example.com");
	expect(users.map((u) => u._id)).toEqual([ownerId]);
	expect(users[0].name).toBe("Real Owner");
});

test("sign-ups that were used are never released", async () => {
	const t = newConvexTest(modules);
	const code = await signUp(t, "ada@example.com", "password123");
	await signIn(t, { flow: "email-verification", email: "ada@example.com", password: "password123", code });
	const account = await passwordAccount(t, "ada@example.com");
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(Date.now() + 60 * 60 * 1000);
	const result = await signIn(t, { flow: "signUp", email: "ada@example.com", password: "different-pass" });
	expect(result.tokens ?? null).toBeNull();
	expect(await passwordAccount(t, "ada@example.com")).toEqual(account);
	const signedIn = await signIn(t, { flow: "signIn", email: "ada@example.com", password: "password123" });
	expect(signedIn.tokens?.token).toBeTruthy();
});

async function sessionCount(t: T) {
	return (await t.run(async (ctx) => ctx.db.query("authSessions").collect())).length;
}

test("sign-up over an existing account answers the same for right and wrong passwords", async () => {
	const t = newConvexTest(modules);
	const code = await signUp(t, "ada@example.com", "password123");
	await signIn(t, { flow: "email-verification", email: "ada@example.com", password: "password123", code });
	const sessions = await sessionCount(t);
	const fetchMock = enableCaptcha();

	const responses = [];
	for (const password of ["password123", "wrong-password", "password123"]) {
		const before = logs.length;
		const result = await signIn(t, {
			flow: "signUp",
			email: "ada@example.com",
			password,
			name: "Mallory",
			turnstileToken: "token",
		});
		responses.push(result);
		// The owner gets a notice instead of a code; no password was checked.
		const sent = logs.slice(before).filter((line) => line.includes("to=ada@example.com "));
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatch(/tried to sign up/);
		expect(sent[0]).not.toMatch(/\b\d{8}\b/);
	}
	expect(responses[0]).toEqual(responses[1]);
	expect(responses[1]).toEqual(responses[2]);
	expect(responses[0].tokens ?? null).toBeNull();
	expect(await sessionCount(t)).toBe(sessions);
	// The response is the one a brand-new address gets.
	const fresh = await signIn(t, {
		flow: "signUp",
		email: "new@example.com",
		password: "password123",
		turnstileToken: "token",
	});
	expect(fresh).toEqual(responses[0]);

	// Nothing reached the sign-in lockout: no failed attempt, no captcha gate.
	expect(await t.run(async (ctx) => ctx.db.query("authRateLimits").collect())).toEqual([]);
	fetchMock.mockClear();
	const signedIn = await signIn(t, { flow: "signIn", email: "ada@example.com", password: "password123" });
	expect(signedIn.tokens?.token).toBeTruthy();
	expect(fetchMock).not.toHaveBeenCalled();
	// The profile was not touched either.
	expect((await userByEmail(t, "ada@example.com"))[0].name).toBe("Ada");
});

test("sign-up notices spend the address's delivery budget like codes", async () => {
	const t = newConvexTest(modules);
	const code = await signUp(t, "ada@example.com", "password123");
	await signIn(t, { flow: "email-verification", email: "ada@example.com", password: "password123", code });
	// The first sign-up spent one of five delivery tokens.
	for (let i = 0; i < 4; i++) {
		await signIn(t, { flow: "signUp", email: "ada@example.com", password: "whatever-pass" });
	}
	await expect(
		signIn(t, { flow: "signUp", email: "ada@example.com", password: "whatever-pass" }),
	).rejects.toThrow(/Too many codes/);
});

test("a fresh pending sign-up can't be wiped by another sign-up", async () => {
	const t = newConvexTest(modules);
	const code = await signUp(t, "ada@example.com", "password123");
	const account = await passwordAccount(t, "ada@example.com");

	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(Date.now() + 10 * 60 * 1000);
	for (let i = 0; i < 3; i++) {
		const result = await signIn(t, { flow: "signUp", email: "ada@example.com", password: "attacker-pass" });
		expect(result.tokens ?? null).toBeNull();
	}
	expect(await passwordAccount(t, "ada@example.com")).toEqual(account);
	// The owner's code still works with the owner's password.
	const verified = await signIn(t, {
		flow: "email-verification",
		email: "ada@example.com",
		password: "password123",
		code,
	});
	expect(verified.tokens?.token).toBeTruthy();
});

test("a pending sign-up with a live code is kept past the window", async () => {
	const t = newConvexTest(modules);
	await signUp(t, "ada@example.com", "password123");
	const account = await passwordAccount(t, "ada@example.com");
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(Date.now() + 14 * 60 * 1000);
	// The owner asks for a new code just before the window ends...
	await signIn(t, { flow: "signIn", email: "ada@example.com", password: "password123" });
	const code = lastCode("ada@example.com");
	vi.setSystemTime(Date.now() + 2 * 60 * 1000);
	// ...so a sign-up after it can't release the account yet.
	await signIn(t, { flow: "signUp", email: "ada@example.com", password: "attacker-pass" });
	expect((await passwordAccount(t, "ada@example.com"))?._id).toBe(account?._id);
	const verified = await signIn(t, {
		flow: "email-verification",
		email: "ada@example.com",
		password: "password123",
		code,
	});
	expect(verified.tokens?.token).toBeTruthy();
});

test("password reset hides unknown addresses and exhausted delivery", async () => {
	const t = newConvexTest(modules);
	expect((await signIn(t, { flow: "reset", email: "nobody@example.com" })).tokens ?? null).toBeNull();

	const signupCode = await signUp(t, "ada@example.com", "password123");
	await signIn(t, {
		flow: "email-verification",
		email: "ada@example.com",
		password: "password123",
		code: signupCode,
	});
	for (let i = 0; i < 4; i++) await signIn(t, { flow: "reset", email: "ada@example.com" });
	const liveCode = lastCode("ada@example.com");
	// The delivery bucket is empty now: same response, and the live code survives.
	const sent = logs.length;
	expect((await signIn(t, { flow: "reset", email: "ada@example.com" })).tokens ?? null).toBeNull();
	expect(logs.length).toBe(sent);

	const reset = await signIn(t, {
		flow: "reset-verification",
		email: "ada@example.com",
		code: liveCode,
		newPassword: "new-password-1",
	});
	expect(reset.tokens?.token).toBeTruthy();
	const signedIn = await signIn(t, { flow: "signIn", email: "ada@example.com", password: "new-password-1" });
	expect(signedIn.tokens?.token).toBeTruthy();
});

test("a password reset of a squatted address signs the verified owner in", async () => {
	const t = newConvexTest(modules);
	const ownerId = await googleUser(t, "owner@example.com", "Real Owner");
	await signUp(t, "owner@example.com", "attacker-pass", "Hacked");
	await signIn(t, { flow: "reset", email: "owner@example.com" });
	const result = await signIn(t, {
		flow: "reset-verification",
		email: "owner@example.com",
		code: lastCode("owner@example.com"),
		newPassword: "owner-password",
	});
	expect(result.tokens?.token).toBeTruthy();
	expect((await passwordAccount(t, "owner@example.com"))?.userId).toBe(ownerId);
	await expect(
		signIn(t, { flow: "signIn", email: "owner@example.com", password: "attacker-pass" }),
	).rejects.toThrow(/InvalidSecret/);
});

test("flows that email a code require a captcha when a secret is configured", async () => {
	const t = newConvexTest(modules);
	vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
	const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
		async () => new Response(JSON.stringify({ success: true, action: "auth" })),
	);
	vi.stubGlobal("fetch", fetchMock);

	await expect(
		signIn(t, { flow: "signUp", email: "ada@example.com", password: "password123" }),
	).rejects.toThrow(/verify that you're human/);
	await expect(signIn(t, { flow: "reset", email: "ada@example.com" })).rejects.toThrow(
		/verify that you're human/,
	);
	expect(fetchMock).not.toHaveBeenCalled();

	await signIn(t, {
		flow: "signUp",
		email: "ada@example.com",
		password: "password123",
		turnstileToken: "token-1",
	});
	expect(fetchMock).toHaveBeenCalledTimes(1);
	const body = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
	expect(body.get("response")).toBe("token-1");

	// Resending through sign-in of the unverified account needs a token too.
	await expect(
		signIn(t, { flow: "signIn", email: "ada@example.com", password: "password123" }),
	).rejects.toThrow(/verify that you're human/);

	// A token for another widget action is refused.
	fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: true, action: "intake" })));
	await expect(
		signIn(t, { flow: "reset", email: "ada@example.com", turnstileToken: "token-2" }),
	).rejects.toThrow(/verify that you're human/);
});

test("without a Turnstile secret the code flows fail closed", async () => {
	const t = newConvexTest(modules);
	vi.stubEnv("INTAKE_CAPTCHA_DISABLED", "");
	await expect(
		signIn(t, { flow: "signUp", email: "ada@example.com", password: "password123" }),
	).rejects.toThrow(/temporarily unavailable/);
});

test("Google sign-in ignores unverified users with the same email", async () => {
	const t = newConvexTest(modules);
	await signUp(t, "ada@example.com", "password123");
	const shellId = (await passwordAccount(t, "ada@example.com"))!.userId as Id<"users">;
	const googleId = await t.run(async (ctx) =>
		createOrUpdateAuthUser(ctx, {
			existingUserId: null,
			type: "oauth",
			profile: { email: "Ada@Example.com", name: "Ada G", emailVerified: true },
		}),
	);
	expect(googleId).not.toBe(shellId);
	const shell = await t.run(async (ctx) => ctx.db.get("users", shellId));
	expect(shell?.name).toBe("Ada");
});

test("Google links to an existing user only when Google verified the email", async () => {
	const t = newConvexTest(modules);
	const ownerId = await googleUser(t, "owner@example.com", "Real Owner");
	const unverifiedId = await t.run(async (ctx) =>
		createOrUpdateAuthUser(ctx, {
			existingUserId: null,
			type: "oauth",
			profile: { email: "owner@example.com", name: "Mallory", emailVerified: false },
		}),
	);
	expect(unverifiedId).not.toBe(ownerId);
	const created = await t.run(async (ctx) => ctx.db.get("users", unverifiedId));
	// Not verified, so nothing can ever link to it by email either.
	expect(created?.emailVerificationTime).toBeUndefined();
	expect((await t.run(async (ctx) => ctx.db.get("users", ownerId)))?.name).toBe("Real Owner");

	// Without the claim at all (the Auth.js default profile) it doesn't link.
	const missingClaimId = await t.run(async (ctx) =>
		createOrUpdateAuthUser(ctx, {
			existingUserId: null,
			type: "oauth",
			profile: { email: "owner@example.com", name: "Mallory" },
		}),
	);
	expect(missingClaimId).not.toBe(ownerId);

	const verifiedId = await t.run(async (ctx) =>
		createOrUpdateAuthUser(ctx, {
			existingUserId: null,
			type: "oauth",
			profile: { email: "owner@example.com", name: "Real Owner", emailVerified: true },
		}),
	);
	expect(verifiedId).toBe(ownerId);
});

test("an already linked Google user keeps their email when Google stops verifying it", async () => {
	const t = newConvexTest(modules);
	const ownerId = await googleUser(t, "owner@example.com", "Real Owner");
	await t.run(async (ctx) =>
		createOrUpdateAuthUser(ctx, {
			existingUserId: ownerId,
			type: "oauth",
			profile: { email: "other@example.com", name: "Real Owner", emailVerified: false },
		}),
	);
	const owner = await t.run(async (ctx) => ctx.db.get("users", ownerId));
	expect(owner?.email).toBe("owner@example.com");
});

/** Turnstile on, siteverify mocked to accept every token. */
function enableCaptcha() {
	vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
	const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
		async () => new Response(JSON.stringify({ success: true, action: "auth" })),
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

test("after a wrong code, code verification requires a captcha", async () => {
	const t = newConvexTest(modules);
	const fetchMock = enableCaptcha();
	const result = await signIn(t, {
		flow: "signUp",
		email: "ada@example.com",
		password: "password123",
		turnstileToken: "token-signup",
	});
	expect(result.tokens).toBeNull();
	const code = lastCode("ada@example.com");
	const params = { flow: "email-verification", email: "ada@example.com", password: "password123" };
	fetchMock.mockClear();

	// The first attempt needs no captcha.
	await expect(signIn(t, { ...params, code: wrongCode(code) })).rejects.toThrow(/Invalid code/);
	expect(fetchMock).not.toHaveBeenCalled();
	// Now every attempt does, even with the right code.
	await expect(signIn(t, { ...params, code })).rejects.toThrow(/verify that you're human/);
	await expect(signIn(t, { ...params, code: wrongCode(code) })).rejects.toThrow(
		/verify that you're human/,
	);
	const verified = await signIn(t, { ...params, code, turnstileToken: "token-verify" });
	expect(verified.tokens?.token).toBeTruthy();
	expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("reset codes also need a captcha after a wrong guess", async () => {
	const t = newConvexTest(modules);
	const signupCode = await signUp(t, "ada@example.com", "password123");
	await signIn(t, {
		flow: "email-verification",
		email: "ada@example.com",
		password: "password123",
		code: signupCode,
	});
	await signIn(t, { flow: "reset", email: "ada@example.com" });
	const code = lastCode("ada@example.com");
	enableCaptcha();
	const params = { flow: "reset-verification", email: "ada@example.com", newPassword: "new-password-1" };
	await expect(signIn(t, { ...params, code: wrongCode(code) })).rejects.toThrow(/Invalid code/);
	await expect(signIn(t, { ...params, code })).rejects.toThrow(/verify that you're human/);
	const reset = await signIn(t, { ...params, code, turnstileToken: "token" });
	expect(reset.tokens?.token).toBeTruthy();
});

test("after a failed password sign-in, sign-ins for that address need a captcha", async () => {
	const t = newConvexTest(modules);
	const code = await signUp(t, "ada@example.com", "password123");
	await signIn(t, { flow: "email-verification", email: "ada@example.com", password: "password123", code });
	const fetchMock = enableCaptcha();

	// Without failures, signing in needs no captcha.
	const first = await signIn(t, { flow: "signIn", email: "ada@example.com", password: "password123" });
	expect(first.tokens?.token).toBeTruthy();
	expect(fetchMock).not.toHaveBeenCalled();

	await expect(
		signIn(t, { flow: "signIn", email: "ada@example.com", password: "wrong-password" }),
	).rejects.toThrow(/InvalidSecret/);
	// The next attempts need one, even with the right password, so scripts
	// can't spend the account's lockout budget for free.
	await expect(
		signIn(t, { flow: "signIn", email: "ada@example.com", password: "password123" }),
	).rejects.toThrow(/verify that you're human/);
	await expect(
		signIn(t, { flow: "signIn", email: "ada@example.com", password: "wrong-password" }),
	).rejects.toThrow(/verify that you're human/);
	// The email-verification flow checks the password too and is gated the same way.
	await expect(
		signIn(t, { flow: "email-verification", email: "ada@example.com", password: "wrong-password" }),
	).rejects.toThrow(/verify that you're human/);
	const limits = await t.run(async (ctx) => ctx.db.query("authRateLimits").collect());
	// Only the first (captcha-free) wrong password reached Convex Auth.
	expect(limits.map((row) => Math.round(10 - row.attemptsLeft))).toEqual([1]);

	const second = await signIn(t, {
		flow: "signIn",
		email: "ada@example.com",
		password: "password123",
		turnstileToken: "token",
	});
	expect(second.tokens?.token).toBeTruthy();
	// A successful sign-in lifts the requirement.
	const third = await signIn(t, { flow: "signIn", email: "ada@example.com", password: "password123" });
	expect(third.tokens?.token).toBeTruthy();
});

test("unknown addresses get the same captcha requirement as real ones", async () => {
	const t = newConvexTest(modules);
	enableCaptcha();
	await expect(
		signIn(t, { flow: "signIn", email: "nobody@example.com", password: "whatever-pass" }),
	).rejects.toThrow(/InvalidAccountId/);
	await expect(
		signIn(t, { flow: "signIn", email: "nobody@example.com", password: "whatever-pass" }),
	).rejects.toThrow(/verify that you're human/);
	await expect(
		signIn(t, {
			flow: "signIn",
			email: "nobody@example.com",
			password: "whatever-pass",
			turnstileToken: "token",
		}),
	).rejects.toThrow(/InvalidAccountId/);
});

test("an unverified account's sign-in verifies one captcha token once", async () => {
	const t = newConvexTest(modules);
	const fetchMock = enableCaptcha();
	await signIn(t, {
		flow: "signUp",
		email: "ada@example.com",
		password: "password123",
		turnstileToken: "token-signup",
	});
	await expect(
		signIn(t, { flow: "signIn", email: "ada@example.com", password: "wrong-password" }),
	).rejects.toThrow(/InvalidSecret/);
	fetchMock.mockClear();
	// Gate and code delivery both need a captcha; the token is checked once.
	const result = await signIn(t, {
		flow: "signIn",
		email: "ada@example.com",
		password: "password123",
		turnstileToken: "token-resend",
	});
	expect(result.tokens ?? null).toBeNull();
	expect(fetchMock).toHaveBeenCalledTimes(1);
});
