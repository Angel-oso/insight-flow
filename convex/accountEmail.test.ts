/**
 * Email change for password accounts must prove ownership of the new
 * address before it becomes the sign-in email (and the verified email
 * Google links to).
 */
import { newConvexTest } from "../test/convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
	vi.stubEnv("EMAIL_DEV_LOG", "true");
	vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

async function fixture() {
	const t = newConvexTest(modules);
	const ids = await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			name: "Ada",
			email: "ada@example.com",
			emailVerificationTime: Date.now(),
		});
		const accountId = await ctx.db.insert("authAccounts", {
			userId,
			provider: "password",
			providerAccountId: "ada@example.com",
			secret: "hash",
			emailVerified: "ada@example.com",
		});
		const victimId = await ctx.db.insert("users", {
			name: "Vic",
			email: "victim@example.com",
			emailVerificationTime: Date.now(),
		});
		return { userId, accountId, victimId };
	});
	return { t, ...ids };
}

test("the account update no longer accepts an email", async () => {
	const { t, userId } = await fixture();
	await expect(
		t.withIdentity({ subject: userId }).action(api.users.account.update, {
			name: "Ada",
			email: "victim@example.com",
		} as never),
	).rejects.toThrow(/email/);
	const user = await t.run((ctx) => ctx.db.get("users", userId));
	expect(user?.email).toBe("ada@example.com");
});

test("a requested change is applied only with the code sent to the new address", async () => {
	const { t, userId, accountId } = await fixture();
	await t.mutation(internal.users.account.createEmailChange, {
		userId,
		email: "new@example.com",
		code: "12345678",
	});
	const request = await t.run((ctx) => ctx.db.query("emailChangeRequests").first());
	expect(request?.email).toBe("new@example.com");
	expect(request?.codeHash).not.toContain("12345678");
	// The code went to the NEW address; nothing changed yet.
	const logged = vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
	expect(logged.some((line) => line.includes("to=new@example.com") && line.includes("12345678"))).toBe(true);
	expect((await t.run((ctx) => ctx.db.get("users", userId)))?.email).toBe("ada@example.com");

	const as = t.withIdentity({ subject: userId });
	await expect(as.action(api.users.account.confirmEmailChange, { code: "00000000" })).rejects.toThrow(
		/not correct/,
	);
	expect((await t.run((ctx) => ctx.db.get("emailChangeRequests", request!._id)))?.attempts).toBe(1);

	const result = await t.mutation(internal.users.account.applyEmailChange, { userId, code: "12345678" });
	expect(result).toMatchObject({ status: "ok", email: "new@example.com", previousEmail: "ada@example.com" });
	const [user, account] = await t.run(async (ctx) => [
		await ctx.db.get("users", userId),
		await ctx.db.get("authAccounts", accountId),
	] as const);
	expect(user?.email).toBe("new@example.com");
	expect(user?.emailVerificationTime).toBeTypeOf("number");
	expect(account).toMatchObject({ providerAccountId: "new@example.com", emailVerified: "new@example.com" });
	// The old address is told about the change.
	const notices = vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
	expect(notices.some((line) => line.includes("to=ada@example.com") && line.includes("was changed"))).toBe(true);
});

test("an address owned by another user cannot be claimed", async () => {
	const { t, userId } = await fixture();
	// Requesting reveals nothing about the address (no existence oracle)...
	await t.mutation(internal.users.account.createEmailChange, {
		userId,
		email: "victim@example.com",
		code: "12345678",
	});
	// ...and only the owner of the inbox, entering its code, learns it is taken.
	expect(
		await t.mutation(internal.users.account.applyEmailChange, { userId, code: "12345678" }),
	).toEqual({ status: "taken" });
	expect((await t.run((ctx) => ctx.db.get("users", userId)))?.email).toBe("ada@example.com");
	expect(await t.run((ctx) => ctx.db.query("emailChangeRequests").collect())).toHaveLength(0);
});

test("probing addresses consumes the code rate limit", async () => {
	const { t, userId } = await fixture();
	const outcomes: string[] = [];
	for (let attempt = 0; attempt < 12; attempt++) {
		try {
			await t.mutation(internal.users.account.createEmailChange, {
				userId,
				email: attempt % 2 ? "victim@example.com" : `probe${attempt}@example.com`,
				code: "12345678",
			});
			outcomes.push("sent");
		} catch (error) {
			outcomes.push(String(error).includes("Too many codes") ? "limited" : String(error));
		}
	}
	// Taken and free addresses look the same, and the limiter stops the loop.
	expect(outcomes).toContain("limited");
	expect(outcomes.every((outcome) => outcome === "sent" || outcome === "limited")).toBe(true);
});

test("duplicate legacy emails do not crash lookups", async () => {
	const { t, userId } = await fixture();
	await t.run(async (ctx) => {
		await ctx.db.insert("users", { name: "Dup 1", email: "dup@example.com" });
		await ctx.db.insert("users", { name: "Dup 2", email: "dup@example.com", emailVerificationTime: 1 });
		await ctx.db.insert("users", { name: "Dup 3", email: "dup@example.com", emailVerificationTime: 2 });
	});
	await t.mutation(internal.users.account.createEmailChange, { userId, email: "dup@example.com", code: "12345678" });
	expect(
		(await t.mutation(internal.users.account.applyEmailChange, { userId, code: "12345678" })).status,
	).toBe("taken");
});

async function changeEmail(t: Awaited<ReturnType<typeof fixture>>["t"], userId: Id<"users">, email: string) {
	await t.mutation(internal.users.account.createEmailChange, { userId, email, code: "12345678" });
	return await t.mutation(internal.users.account.applyEmailChange, { userId, code: "12345678" });
}

test("an unverified password sign-up can't squat an address against an email change", async () => {
	const { t, userId, accountId } = await fixture();
	const squatter = await t.run(async (ctx) => {
		const squatterId = await ctx.db.insert("users", { name: "Squatter", email: "new@example.com" });
		const squatterAccountId = await ctx.db.insert("authAccounts", {
			userId: squatterId,
			provider: "password",
			providerAccountId: "new@example.com",
			secret: "hash",
		});
		await ctx.db.insert("authVerificationCodes", {
			accountId: squatterAccountId,
			provider: "password-verify",
			code: "hashed",
			expirationTime: Date.now() + 60_000,
		});
		return { squatterId, squatterAccountId };
	});
	expect(await changeEmail(t, userId, "new@example.com")).toMatchObject({ status: "ok" });
	const state = await t.run(async (ctx) => ({
		squatter: await ctx.db.get("users", squatter.squatterId),
		squatterAccount: await ctx.db.get("authAccounts", squatter.squatterAccountId),
		codes: await ctx.db.query("authVerificationCodes").collect(),
		account: await ctx.db.get("authAccounts", accountId),
	}));
	expect(state.squatter).toBeNull();
	expect(state.squatterAccount).toBeNull();
	expect(state.codes).toEqual([]);
	expect(state.account?.providerAccountId).toBe("new@example.com");
});

test("an unverified display email (e.g. unverified Google) doesn't block an email change", async () => {
	const { t, userId } = await fixture();
	const googleId = await t.run(async (ctx) => {
		const id = await ctx.db.insert("users", { name: "Mallory", email: "new@example.com" });
		await ctx.db.insert("authAccounts", { userId: id, provider: "google", providerAccountId: "g-1" });
		return id;
	});
	expect(await changeEmail(t, userId, "new@example.com")).toMatchObject({ status: "ok" });
	// Left alone: it never had the address verified, so nothing links to it.
	expect((await t.run((ctx) => ctx.db.get("users", googleId)))?.emailVerificationTime).toBeUndefined();
});

test("verified or used holders of an address still block an email change", async () => {
	const { t, userId } = await fixture();
	// A verified password account.
	await t.run(async (ctx) => {
		const id = await ctx.db.insert("users", { email: "verified@example.com" });
		await ctx.db.insert("authAccounts", {
			userId: id,
			provider: "password",
			providerAccountId: "verified@example.com",
			emailVerified: "verified@example.com",
		});
	});
	expect(await changeEmail(t, userId, "verified@example.com")).toEqual({ status: "taken" });
	// A legacy unverified password account that was used (has a session).
	const legacyId = await t.run(async (ctx) => {
		const id = await ctx.db.insert("users", { email: "legacy@example.com" });
		await ctx.db.insert("authAccounts", { userId: id, provider: "password", providerAccountId: "legacy@example.com" });
		await ctx.db.insert("authSessions", { userId: id, expirationTime: Date.now() + 60_000 });
		return id;
	});
	expect(await changeEmail(t, userId, "legacy@example.com")).toEqual({ status: "taken" });
	expect(await t.run((ctx) => ctx.db.get("users", legacyId))).not.toBeNull();
	// A verified user without a password account (e.g. Google).
	await t.run(async (ctx) => {
		await ctx.db.insert("users", { email: "google@example.com", emailVerificationTime: Date.now() });
	});
	expect(await changeEmail(t, userId, "google@example.com")).toEqual({ status: "taken" });
	expect((await t.run((ctx) => ctx.db.get("users", userId)))?.email).toBe("ada@example.com");
});

test("too many wrong codes discard the request", async () => {
	const { t, userId } = await fixture();
	await t.mutation(internal.users.account.createEmailChange, { userId, email: "new@example.com", code: "12345678" });
	const statuses = [];
	for (let attempt = 0; attempt < 5; attempt++) {
		statuses.push((await t.mutation(internal.users.account.applyEmailChange, { userId, code: "99999999" })).status);
	}
	expect(statuses).toEqual(["invalid", "invalid", "invalid", "invalid", "locked"]);
	expect(
		(await t.mutation(internal.users.account.applyEmailChange, { userId, code: "12345678" })).status,
	).toBe("missing");
	expect((await t.run((ctx) => ctx.db.get("users", userId)))?.email).toBe("ada@example.com");
});

test("the profile exposes the pending address until it is confirmed", async () => {
	const { t, userId } = await fixture();
	const as = t.withIdentity({ subject: userId });
	await t.mutation(internal.users.account.createEmailChange, { userId, email: "new@example.com", code: "12345678" });
	expect(await as.query(api.users.queries.current, {})).toMatchObject({
		email: "ada@example.com",
		pendingEmail: "new@example.com",
	});
	await as.mutation(api.users.account.cancelEmailChange, {});
	expect((await as.query(api.users.queries.current, {}))?.pendingEmail).toBeNull();
});
