/**
 * Account security: revoked sessions stop working at once, account deletion
 * re-authenticates, the personal data export returns only the caller's own
 * data, and project slugs can't be probed for existence.
 */
import { exportPKCS8, generateKeyPair } from "jose";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { newConvexTest } from "../test/convex-test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
type T = ReturnType<typeof newConvexTest>;

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
	vi.restoreAllMocks();
});

/** Caller identity exactly as Convex Auth issues it: `userId|sessionId`. */
function asSession(t: T, userId: Id<"users">, sessionId: Id<"authSessions">) {
	return t.withIdentity({ subject: `${userId}|${sessionId}` });
}

async function userWithSession(t: T, email: string) {
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", { email, name: "Ada", emailVerificationTime: Date.now() });
		await ctx.db.insert("authAccounts", { userId, provider: "google", providerAccountId: `g-${email}` });
		const sessionId = await ctx.db.insert("authSessions", {
			userId,
			expirationTime: Date.now() + 86_400_000,
		});
		return { userId, sessionId };
	});
}

/** A verified password account created through the real sign-up flow. */
async function passwordUser(t: T, email: string, password: string) {
	await t.action(api.auth.signIn, {
		provider: "password",
		params: { flow: "signUp", email, password, name: "Ada" },
	});
	const line = logs.filter((entry) => entry.includes(`to=${email} `)).at(-1) ?? "";
	const code = /\b(\d{8})\b/.exec(line)?.[1];
	const verified = await t.action(api.auth.signIn, {
		provider: "password",
		params: { flow: "email-verification", email, password, code: code ?? "" },
	});
	expect(verified.tokens?.token).toBeTruthy();
	return await t.run(async (ctx) => {
		const account = await ctx.db
			.query("authAccounts")
			.withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", email))
			.unique();
		const session = await ctx.db
			.query("authSessions")
			.withIndex("userId", (q) => q.eq("userId", account!.userId))
			.first();
		return { userId: account!.userId, sessionId: session!._id };
	});
}

test("a token whose session was revoked is refused", async () => {
	const t = newConvexTest(modules);
	const { userId, sessionId } = await userWithSession(t, "ada@example.com");
	const caller = asSession(t, userId, sessionId);
	expect((await caller.query(api.users.queries.current, {}))?.id).toBe(userId);
	await expect(caller.query(api.users.export.profile, {})).resolves.toMatchObject({
		user: { id: userId },
	});

	// invalidateSessions (password reset/change, email change) deletes it.
	await t.run(async (ctx) => ctx.db.delete("authSessions", sessionId));
	expect(await caller.query(api.users.queries.current, {})).toBeNull();
	await expect(caller.query(api.users.export.profile, {})).rejects.toThrow(/Sign in/);
	await expect(caller.mutation(api.users.account.cancelEmailChange, {})).rejects.toThrow(/Sign in/);
	await expect(caller.action(api.users.account.confirmEmailChange, { code: "12345678" })).rejects.toThrow(
		/Sign in/,
	);
});

test("a session of another user does not authenticate", async () => {
	const t = newConvexTest(modules);
	const ada = await userWithSession(t, "ada@example.com");
	const bob = await userWithSession(t, "bob@example.com");
	const forged = asSession(t, ada.userId, bob.sessionId);
	expect(await forged.query(api.users.queries.current, {})).toBeNull();
	const malformed = t.withIdentity({ subject: `${ada.userId}|not-a-session` });
	expect(await malformed.query(api.users.queries.current, {})).toBeNull();
});

test("password accounts must enter their password to delete the account", async () => {
	const t = newConvexTest(modules);
	const { userId, sessionId } = await passwordUser(t, "ada@example.com", "password123");
	const caller = asSession(t, userId, sessionId);
	await expect(
		caller.action(api.users.deletion.deleteAccount, { confirmation: "ada@example.com" }),
	).rejects.toThrow(/current password/);
	await expect(
		caller.action(api.users.deletion.deleteAccount, {
			confirmation: "ada@example.com",
			currentPassword: "wrong-password",
		}),
	).rejects.toThrow(/Current password is incorrect/);
	expect(await t.run(async (ctx) => ctx.db.get("users", userId))).not.toBeNull();

	await caller.action(api.users.deletion.deleteAccount, {
		confirmation: "ada@example.com",
		currentPassword: "password123",
	});
	await t.finishAllScheduledFunctions(() => {});
	expect(await t.run(async (ctx) => ctx.db.get("users", userId))).toBeNull();
});

test("OAuth-only accounts need a recent sign-in to delete the account", async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	const t = newConvexTest(modules);
	const { userId, sessionId } = await userWithSession(t, "ada@example.com");
	const caller = asSession(t, userId, sessionId);
	vi.setSystemTime(Date.now() + 11 * 60 * 1000);
	await expect(
		caller.action(api.users.deletion.deleteAccount, { confirmation: "ada@example.com" }),
	).rejects.toThrow(/sign in again/);
	expect(await t.run(async (ctx) => ctx.db.get("users", userId))).not.toBeNull();

	// A fresh sign-in (new session) is accepted.
	const freshId = await t.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", { name: "Acme", slug: "acme", ownerId: userId });
		const projectId = await ctx.db.insert("projects", {
			organizationId,
			name: "Portal",
			slug: "portal",
			description: "",
			status: "Active",
			inboxEnabled: true,
			defaultPriority: "Medium",
			criticalAlerts: false,
			weeklyDigest: false,
		});
		// Owned by someone else so the account isn't refused as an owner.
		await ctx.db.patch("organizations", organizationId, {
			ownerId: await ctx.db.insert("users", { name: "Owner" }),
		});
		await ctx.db.insert("notificationPreferences", {
			userId,
			projectId,
			criticalAlerts: true,
			weeklyDigest: true,
			unsubscribeToken: "token",
			updatedAt: Date.now(),
		});
		return await ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 86_400_000 });
	});
	await asSession(t, userId, freshId).action(api.users.deletion.deleteAccount, {
		confirmation: "ada@example.com",
	});
	expect(await t.run(async (ctx) => ctx.db.get("users", userId))).toBeNull();
	const preferences = await t.run(async (ctx) => ctx.db.query("notificationPreferences").collect());
	expect(preferences).toEqual([]);
});

test("the data export returns only the caller's own data, in bounded pages", async () => {
	const t = newConvexTest(modules);
	const ada = await userWithSession(t, "ada@example.com");
	const bob = await userWithSession(t, "bob@example.com");
	const ids = await t.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Acme",
			slug: "acme",
			ownerId: ada.userId,
		});
		const viewId = await ctx.db.insert("permissions", { key: "feedback.view" });
		const roleId = await ctx.db.insert("roles", { name: "member", permissionIds: [viewId] });
		await ctx.db.insert("organizationMembers", { organizationId, userId: ada.userId, roleIds: [roleId] });
		const projectId = await ctx.db.insert("projects", {
			organizationId,
			name: "Portal",
			slug: "portal",
			description: "",
			status: "Active",
			inboxEnabled: true,
			defaultPriority: "Medium",
			criticalAlerts: false,
			weeklyDigest: false,
		});
		await ctx.db.insert("projectMembers", { projectId, userId: ada.userId, roleId, joinedAt: 1 });
		const item = (assigneeId: Id<"users"> | null, title: string) =>
			ctx.db.insert("feedback", {
				projectId,
				title,
				description: "A description",
				category: "Bug",
				priority: "Medium",
				status: "New",
				assigneeId,
				sender: { name: "Customer", email: "customer@example.com" },
				receivedAt: 1,
				updatedAt: 1,
			});
		const mine = await item(ada.userId, "Assigned to Ada");
		const logged = await item(null, "Logged by Ada");
		const other = await item(bob.userId, "Assigned to Bob");
		await ctx.db.insert("activities", {
			projectId,
			feedbackId: logged,
			actorId: ada.userId,
			type: "received",
			message: "Logged by the team",
			createdAt: 1,
		});
		await ctx.db.insert("comments", { feedbackId: mine, authorId: ada.userId, body: "Ada's note", createdAt: 2 });
		await ctx.db.insert("comments", { feedbackId: mine, authorId: bob.userId, body: "Bob's note", createdAt: 3 });
		// A project Ada was removed from: her completed item and one she logged stay.
		const formerId = await ctx.db.insert("projects", {
			organizationId,
			name: "Former",
			slug: "former",
			description: "",
			status: "Active",
			inboxEnabled: true,
			defaultPriority: "Medium",
			criticalAlerts: false,
			weeklyDigest: false,
		});
		const formerItem = (assigneeId: Id<"users"> | null, title: string) =>
			ctx.db.insert("feedback", {
				projectId: formerId,
				title,
				description: "Secret team details",
				category: "Bug",
				priority: "Medium",
				status: "Done",
				assigneeId,
				sender: null,
				receivedAt: 5,
				updatedAt: 5,
			});
		const formerMine = await formerItem(ada.userId, "Former assigned");
		const formerLogged = await formerItem(null, "Former logged");
		await ctx.db.insert("activities", {
			projectId: formerId,
			feedbackId: formerLogged,
			actorId: ada.userId,
			type: "received",
			message: "Logged by the team",
			createdAt: 6,
		});
		return { mine, logged, other, formerMine, formerLogged, formerId };
	});
	const caller = asSession(t, ada.userId, ada.sessionId);
	const first = { numItems: 50, cursor: null };

	const profile = await caller.query(api.users.export.profile, {});
	expect(profile.user.email).toBe("ada@example.com");
	expect(profile.organizations).toEqual([
		expect.objectContaining({ name: "Acme", roles: ["member"], isOwner: true }),
	]);
	expect(profile.projects).toEqual([expect.objectContaining({ name: "Portal", role: "member" })]);
	expect(profile.signInMethods).toEqual([{ provider: "google", email: null }]);

	const comments = await caller.query(api.users.export.comments, { paginationOpts: first });
	expect(comments.page.map((comment) => comment.body)).toEqual(["Ada's note"]);
	const assigned = await caller.query(api.users.export.assignedFeedback, { paginationOpts: first });
	expect(assigned.page.map((item) => item.feedbackId)).toEqual([ids.mine, ids.formerMine]);
	expect(assigned.page[0]).toMatchObject({ access: "current", relation: "assigned", title: "Assigned to Ada" });
	// Without access, only Ada's own link to the item: no live content.
	expect(assigned.page[1]).toEqual({
		access: "revoked",
		relation: "assigned",
		feedbackId: ids.formerMine,
		projectId: ids.formerId,
		date: 5,
	});
	// Third-party personal data (the feedback sender) is not exported.
	expect(JSON.stringify(assigned.page)).not.toContain("customer@example.com");
	const created = await caller.query(api.users.export.createdFeedback, { paginationOpts: first });
	expect(created.page.map((item) => item.feedbackId)).toEqual([ids.logged, ids.formerLogged]);
	expect(created.page[0]).toMatchObject({ access: "current", relation: "created", title: "Logged by Ada" });
	expect(created.page[1]).toEqual({
		access: "revoked",
		relation: "created",
		feedbackId: ids.formerLogged,
		projectId: ids.formerId,
		date: 6,
	});
	expect(JSON.stringify([...assigned.page, ...created.page])).not.toMatch(/Former|Secret team details/);

	// A project marked for deletion no longer exposes content either.
	await t.run(async (ctx) => {
		const portal = (await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", "portal")).unique())!;
		await ctx.db.patch("projects", portal._id, { deletionRequestedAt: Date.now() });
	});
	const afterMark = await caller.query(api.users.export.assignedFeedback, { paginationOpts: first });
	expect(afterMark.page.every((item) => item.access === "revoked")).toBe(true);
	await t.run(async (ctx) => {
		const portal = (await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", "portal")).unique())!;
		await ctx.db.patch("projects", portal._id, { deletionRequestedAt: undefined });
	});
	const activity = await caller.query(api.users.export.activity, { paginationOpts: first });
	expect(activity.page).toHaveLength(2);

	await expect(
		caller.query(api.users.export.comments, { paginationOpts: { numItems: 1000, cursor: null } }),
	).rejects.toThrow(/items per page/);
	await expect(t.query(api.users.export.profile, {})).rejects.toThrow(/Sign in/);
	await expect(t.query(api.users.export.comments, { paginationOpts: first })).rejects.toThrow(/Sign in/);
});

test("missing projects and projects without access give the same error", async () => {
	const t = newConvexTest(modules);
	const owner = await userWithSession(t, "owner@example.com");
	const outsider = await userWithSession(t, "outsider@example.com");
	await t.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Acme",
			slug: "acme",
			ownerId: owner.userId,
		});
		await ctx.db.insert("projects", {
			organizationId,
			name: "Portal",
			slug: "portal",
			description: "",
			status: "Active",
			inboxEnabled: true,
			defaultPriority: "Medium",
			criticalAlerts: false,
			weeklyDigest: false,
		});
	});
	const caller = asSession(t, outsider.userId, outsider.sessionId);
	const existing = await caller
		.query(api.feedback.queries.workspace, { projectSlug: "portal" })
		.then(() => null, (error: Error) => error.message);
	const missing = await caller
		.query(api.feedback.queries.workspace, { projectSlug: "no-such-project" })
		.then(() => null, (error: Error) => error.message);
	expect(existing).toContain("Project not found.");
	expect(missing).toContain("Project not found.");
	expect(existing).not.toContain("denied");
});
