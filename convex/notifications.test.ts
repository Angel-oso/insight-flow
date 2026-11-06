/**
 * Email notifications: settings toggles, critical alert scheduling and the
 * weekly digest. Emails run in EMAIL_DEV_LOG mode (printed, not sent), and
 * the scheduled workers are invoked directly to inspect their recipients.
 */
import { newConvexTest } from "../test/convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { capabilities, type Capability, type Role } from "../lib/auth/permissions";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
	vi.stubEnv("EMAIL_DEV_LOG", "true");
	vi.stubEnv("SITE_URL", "https://app.example.com");
	vi.stubEnv("CONVEX_SITE_URL", "https://happy-test-123.convex.site");
	vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

const rolePermissions: Record<Role, readonly Capability[]> = {
	admin: capabilities,
	manager: [
		"feedback.view", "feedback.triage", "feedback.assign",
		"feedback.update", "feedback.comment", "project.view", "team.view",
	],
	member: ["feedback.view", "feedback.update", "feedback.comment", "project.view"],
};

async function fixture(options: { criticalAlerts?: boolean; weeklyDigest?: boolean } = {}) {
	const t = newConvexTest(modules);
	const ids = await t.run(async (ctx) => {
		const now = Date.now();
		const permissionIds = new Map<Capability, Id<"permissions">>();
		for (const key of capabilities) permissionIds.set(key, await ctx.db.insert("permissions", { key }));
		const roleIds = new Map<Role, Id<"roles">>();
		for (const name of ["admin", "manager", "member"] as const) {
			roleIds.set(name, await ctx.db.insert("roles", {
				name,
				permissionIds: rolePermissions[name].map((key) => permissionIds.get(key)!),
			}));
		}
		const verified = { emailVerificationTime: now };
		const admin = await ctx.db.insert("users", { name: "Ada", email: "admin@example.com", ...verified });
		const manager = await ctx.db.insert("users", { name: "Moe", email: "manager@example.com", ...verified });
		const member = await ctx.db.insert("users", { name: "Dan", email: "member@example.com", ...verified });
		// Can triage but never proved the address: must not receive email.
		const unverified = await ctx.db.insert("users", { name: "Una", email: "unverified@example.com" });
		// Triager of another project only.
		const outsider = await ctx.db.insert("users", { name: "Oz", email: "outsider@example.com", ...verified });
		const organizationId = await ctx.db.insert("organizations", { name: "Org", slug: "org", ownerId: admin });
		for (const [userId, role] of [
			[admin, "admin"], [manager, "manager"], [member, "member"],
			[unverified, "manager"], [outsider, "manager"],
		] as const) {
			await ctx.db.insert("organizationMembers", { organizationId, userId, roleIds: [roleIds.get(role)!] });
		}
		const project = (slug: string, overrides: Partial<{ criticalAlerts: boolean; weeklyDigest: boolean; status: "Active" | "Archived" }> = {}) =>
			ctx.db.insert("projects", {
				organizationId, name: slug, slug, description: "", status: overrides.status ?? "Active",
				inboxEnabled: true, defaultPriority: "Medium",
				criticalAlerts: overrides.criticalAlerts ?? false,
				weeklyDigest: overrides.weeklyDigest ?? false,
				updatedAt: now,
			});
		const portal = await project("portal", options);
		const other = await project("other", { criticalAlerts: true, weeklyDigest: true });
		for (const userId of [admin, manager, member, unverified]) {
			await ctx.db.insert("projectMembers", { projectId: portal, userId, joinedAt: now });
		}
		await ctx.db.insert("projectMembers", { projectId: other, userId: outsider, joinedAt: now });
		return { admin, manager, member, organizationId, portal, other };
	});
	return { t, ...ids };
}

async function scheduled(t: ReturnType<typeof newConvexTest>, name: string) {
	return t.run(async (ctx) =>
		(await ctx.db.system.query("_scheduled_functions").collect()).filter((job) => job.name.includes(name)),
	);
}

test("settings toggles require project.manage and persist", async () => {
	const { t, admin, manager, portal } = await fixture();
	await expect(
		t.withIdentity({ subject: manager }).mutation(api.projects.settings.update, {
			projectSlug: "portal",
			changes: { criticalAlerts: true },
		}),
	).rejects.toThrow(/cannot make this change/);
	await t.withIdentity({ subject: admin }).mutation(api.projects.settings.update, {
		projectSlug: "portal",
		changes: { criticalAlerts: true, weeklyDigest: true },
	});
	const project = await t.run((ctx) => ctx.db.get("projects", portal));
	expect(project).toMatchObject({ criticalAlerts: true, weeklyDigest: true });
});

test("critical alert targets only verified triagers of that project", async () => {
	const { t, manager } = await fixture({ criticalAlerts: true });
	const { feedbackId } = await t.withIdentity({ subject: manager }).mutation(api.feedback.mutations.create, {
		projectSlug: "portal",
		title: "Checkout is down",
		description: "Nobody can pay since the last deploy.",
		category: "Bug",
		priority: "Critical",
	});
	const jobs = await scheduled(t, "sendCriticalAlert");
	expect(jobs).toHaveLength(1);
	expect(jobs[0].args[0]).toMatchObject({ feedbackId, priority: "Critical" });
	const recipients = await t.mutation(internal.notifications.critical.sendCriticalAlert, {
		feedbackId,
		priority: "Critical",
	});
	expect(recipients.sort()).toEqual(["admin@example.com", "manager@example.com"]);
	const logged = vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
	expect(logged.some((line) => line.includes(`https://app.example.com/projects/portal/feedback?feedback=${feedbackId}`))).toBe(true);
	expect(logged.some((line) => line.includes("turn it off in project settings"))).toBe(true);
});

test("no critical alert when disabled or below the top priority", async () => {
	const disabled = await fixture({ criticalAlerts: false });
	await disabled.t.withIdentity({ subject: disabled.manager }).mutation(api.feedback.mutations.create, {
		projectSlug: "portal", title: "Checkout is down", description: "Nobody can pay since the deploy.",
		category: "Bug", priority: "Critical",
	});
	expect(await scheduled(disabled.t, "sendCriticalAlert")).toHaveLength(0);

	const enabled = await fixture({ criticalAlerts: true });
	await enabled.t.withIdentity({ subject: enabled.manager }).mutation(api.feedback.mutations.create, {
		projectSlug: "portal", title: "Slow search", description: "Search takes several seconds.",
		category: "Bug", priority: "High",
	});
	expect(await scheduled(enabled.t, "sendCriticalAlert")).toHaveLength(0);
});

test("raising priority to the top rank schedules an alert", async () => {
	const { t, manager } = await fixture({ criticalAlerts: true });
	const as = t.withIdentity({ subject: manager });
	const { feedbackId } = await as.mutation(api.feedback.mutations.create, {
		projectSlug: "portal", title: "Export fails", description: "CSV export returns a 500.",
		category: "Bug", priority: "Medium",
	});
	expect(await scheduled(t, "sendCriticalAlert")).toHaveLength(0);
	await as.mutation(api.feedback.mutations.update, {
		projectSlug: "portal", feedbackId, changes: { priority: "Critical" },
	});
	expect(await scheduled(t, "sendCriticalAlert")).toHaveLength(1);
	// Lowered again before the worker ran: nothing is sent.
	await as.mutation(api.feedback.mutations.update, {
		projectSlug: "portal", feedbackId, changes: { priority: "Low" },
	});
	expect(
		await t.mutation(internal.notifications.critical.sendCriticalAlert, { feedbackId, priority: "Critical" }),
	).toEqual([]);
});

test("weekly digest schedules only opted-in, active projects", async () => {
	const { t, portal, other, organizationId } = await fixture({ weeklyDigest: false });
	const archived = await t.run((ctx) =>
		ctx.db.insert("projects", {
			organizationId, name: "Archived", slug: "archived", description: "", status: "Archived",
			inboxEnabled: false, defaultPriority: "Medium", criticalAlerts: true, weeklyDigest: true,
		}),
	);
	const result = await t.mutation(internal.notifications.digest.run, { cursor: null });
	expect(result).toEqual({ scheduled: 1, done: true });
	const jobs = await scheduled(t, "sendProjectDigest");
	const targets = jobs.map((job) => (job.args[0] as { projectId: Id<"projects"> }).projectId);
	expect(targets).toEqual([other]);
	expect(targets).not.toContain(portal);
	expect(targets).not.toContain(archived);
});

test("digest summarizes the project for its triagers", async () => {
	const { t, manager, portal } = await fixture({ weeklyDigest: true });
	const as = t.withIdentity({ subject: manager });
	const { feedbackId } = await as.mutation(api.feedback.mutations.create, {
		projectSlug: "portal", title: "Checkout is down", description: "Nobody can pay since the deploy.",
		category: "Bug", priority: "Critical",
	});
	const second = await as.mutation(api.feedback.mutations.create, {
		projectSlug: "portal", title: "Typo on pricing", description: "Monthly is misspelled on the page.",
		category: "Bug", priority: "Low",
	});
	await as.mutation(api.feedback.mutations.update, {
		projectSlug: "portal", feedbackId: second.feedbackId, changes: { status: "Completed" },
	});
	const digest = await t.mutation(internal.notifications.digest.sendProjectDigest, {
		projectId: portal,
		windowEnd: Date.now() + 1000,
	});
	expect(digest?.recipients.sort()).toEqual(["admin@example.com", "manager@example.com"]);
	expect(digest?.stats).toMatchObject({ received: 2, resolved: 1, open: 1, critical: 1 });
	const logged = vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
	expect(logged.some((line) => line.includes(`feedback?feedback=${feedbackId}`))).toBe(true);
});

// ---- Abuse protection, preferences, unsubscribe and suppression ----

type T = ReturnType<typeof newConvexTest>;

async function logCritical(t: T, manager: Id<"users">, title = "Checkout is down") {
	const { feedbackId } = await t.withIdentity({ subject: manager }).mutation(api.feedback.mutations.create, {
		projectSlug: "portal", title, description: "Nobody can pay since the last deploy.",
		category: "Bug", priority: "Critical",
	});
	return feedbackId;
}

function loggedEmails() {
	return vi.mocked(console.log).mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith("[email:dev]"));
}

function unsubscribeLink(to: string) {
	const email = loggedEmails().reverse().find((line) => line.includes(`to=${to} `));
	const match = /List-Unsubscribe: <([^>]+)>/.exec(email ?? "");
	if (!match) throw new Error(`No List-Unsubscribe header for ${to}`);
	return new URL(match[1]);
}

test("feedback updates are rate limited per user", async () => {
	const { t, manager } = await fixture();
	const as = t.withIdentity({ subject: manager });
	const { feedbackId } = await as.mutation(api.feedback.mutations.create, {
		projectSlug: "portal", title: "Export fails", description: "CSV export returns a 500.",
		category: "Bug", priority: "Medium",
	});
	const priorities = ["High", "Critical"];
	for (let i = 0; i < 30; i += 1) {
		await as.mutation(api.feedback.mutations.update, {
			projectSlug: "portal", feedbackId, changes: { priority: priorities[i % 2] },
		});
	}
	await expect(
		as.mutation(api.feedback.mutations.update, { projectSlug: "portal", feedbackId, changes: { priority: "Low" } }),
	).rejects.toThrow(/updating feedback too quickly/);
});

test("toggling an item's priority sends at most one critical alert", async () => {
	const { t, manager } = await fixture({ criticalAlerts: true });
	const as = t.withIdentity({ subject: manager });
	const feedbackId = await logCritical(t, manager);
	expect(await t.mutation(internal.notifications.critical.sendCriticalAlert, { feedbackId, priority: "Critical" })).toHaveLength(2);
	for (const priority of ["High", "Critical", "High", "Critical"]) {
		await as.mutation(api.feedback.mutations.update, { projectSlug: "portal", feedbackId, changes: { priority } });
	}
	// Only the alert from creation was ever scheduled.
	expect(await scheduled(t, "sendCriticalAlert")).toHaveLength(1);
	// A duplicate job (e.g. scheduled before the first ran) sends nothing.
	expect(await t.mutation(internal.notifications.critical.sendCriticalAlert, { feedbackId, priority: "Critical" })).toEqual([]);
	expect(loggedEmails()).toHaveLength(2);
});

test("a burst of critical items folds into one summary email", async () => {
	const { t, manager, portal } = await fixture({ criticalAlerts: true });
	const sent: string[][] = [];
	for (let i = 0; i < 8; i += 1) {
		const feedbackId = await logCritical(t, manager, `Outage number ${i}`);
		sent.push(await t.mutation(internal.notifications.critical.sendCriticalAlert, { feedbackId, priority: "Critical" }));
	}
	expect(sent.filter((recipients) => recipients.length > 0)).toHaveLength(5);
	expect(sent.slice(5)).toEqual([[], [], []]);
	// One summary scheduled for the whole burst.
	expect(await scheduled(t, "sendCriticalSummary")).toHaveLength(1);
	const before = loggedEmails().length;
	const recipients = await t.mutation(internal.notifications.critical.sendCriticalSummary, { projectId: portal });
	expect(recipients.sort()).toEqual(["admin@example.com", "manager@example.com"]);
	const summaries = loggedEmails().slice(before);
	expect(summaries).toHaveLength(2);
	expect(summaries[0]).toContain("3 more Critical items");
	expect(summaries[0]).toContain("Outage number 7");
	// Settled: a second run sends nothing.
	expect(await t.mutation(internal.notifications.critical.sendCriticalSummary, { projectId: portal })).toEqual([]);
});

test("personal preferences are respected and only editable by the member", async () => {
	const { t, admin, manager, portal } = await fixture({ criticalAlerts: true, weeklyDigest: true });
	await t.withIdentity({ subject: admin }).mutation(api.notifications.preferences.update, {
		projectSlug: "portal", criticalAlerts: false,
	});
	expect(await t.withIdentity({ subject: admin }).query(api.notifications.preferences.get, { projectSlug: "portal" }))
		.toMatchObject({ criticalAlerts: false, weeklyDigest: true, canTriage: true, suppressed: false });
	// Another member's preferences are untouched.
	expect(await t.withIdentity({ subject: manager }).query(api.notifications.preferences.get, { projectSlug: "portal" }))
		.toMatchObject({ criticalAlerts: true, weeklyDigest: true });
	const feedbackId = await logCritical(t, manager);
	expect(await t.mutation(internal.notifications.critical.sendCriticalAlert, { feedbackId, priority: "Critical" }))
		.toEqual(["manager@example.com"]);
	const digest = await t.mutation(internal.notifications.digest.sendProjectDigest, { projectId: portal, windowEnd: Date.now() + 1000 });
	expect(digest?.recipients.sort()).toEqual(["admin@example.com", "manager@example.com"]);
	// Signed out and non-members are refused.
	await expect(t.mutation(api.notifications.preferences.update, { projectSlug: "portal", weeklyDigest: false }))
		.rejects.toThrow(/Sign in/);
	const outsider = await t.run((ctx) => ctx.db.query("users").filter((q) => q.eq(q.field("email"), "outsider@example.com")).first());
	await expect(
		t.withIdentity({ subject: outsider!._id }).mutation(api.notifications.preferences.update, { projectSlug: "portal", weeklyDigest: false }),
	).rejects.toThrow();
});

test("notification emails carry one-click unsubscribe; GET is read-only, POST unsubscribes", async () => {
	const { t, manager } = await fixture({ criticalAlerts: true });
	const feedbackId = await logCritical(t, manager);
	await t.mutation(internal.notifications.critical.sendCriticalAlert, { feedbackId, priority: "Critical" });
	const email = loggedEmails().find((line) => line.includes("to=manager@example.com"))!;
	expect(email).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
	const link = unsubscribeLink("manager@example.com");
	expect(link.origin).toBe("https://happy-test-123.convex.site");
	// Footer link in the body too.
	expect(email.split("List-Unsubscribe").length).toBeGreaterThan(2);
	const path = `${link.pathname}${link.search}`;
	const prefs = () => t.withIdentity({ subject: manager }).query(api.notifications.preferences.get, { projectSlug: "portal" });

	const page = await t.fetch(path, { method: "GET" });
	expect(page.status).toBe(200);
	const html = await page.text();
	expect(html).toContain('method="post"');
	expect(html).toContain("critical alerts");
	expect(await prefs()).toMatchObject({ criticalAlerts: true });

	const done = await t.fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: "List-Unsubscribe=One-Click",
	});
	expect(done.status).toBe(200);
	expect(await done.text()).toContain("unsubscribed");
	expect(await prefs()).toMatchObject({ criticalAlerts: false, weeklyDigest: true });
	// The next alert skips the unsubscribed member.
	const next = await logCritical(t, manager, "Login is down");
	expect(await t.mutation(internal.notifications.critical.sendCriticalAlert, { feedbackId: next, priority: "Critical" }))
		.toEqual(["admin@example.com"]);
});

test("invalid unsubscribe tokens are refused", async () => {
	const { t, manager } = await fixture({ criticalAlerts: true });
	const feedbackId = await logCritical(t, manager);
	await t.mutation(internal.notifications.critical.sendCriticalAlert, { feedbackId, priority: "Critical" });
	const forged = "a".repeat(64);
	for (const query of [`token=${forged}&list=critical`, "token=short&list=critical", `token=${forged}&list=everything`, ""]) {
		expect((await t.fetch(`/notifications/unsubscribe?${query}`, { method: "POST" })).status).toBe(400);
		expect((await t.fetch(`/notifications/unsubscribe?${query}`, { method: "GET" })).status).toBe(400);
	}
	// A valid token for one list doesn't touch the other.
	const link = unsubscribeLink("manager@example.com");
	link.searchParams.set("list", "digest");
	expect((await t.fetch(`${link.pathname}${link.search}`, { method: "POST" })).status).toBe(200);
	expect(await t.withIdentity({ subject: manager }).query(api.notifications.preferences.get, { projectSlug: "portal" }))
		.toMatchObject({ criticalAlerts: true, weeklyDigest: false });
});

function bounceEvent(to: string, type: string) {
	const now = new Date().toISOString();
	return {
		id: "email-id",
		event: {
			type: "email.bounced",
			created_at: now,
			data: {
				created_at: now,
				email_id: "re_123",
				from: "InsightFlow <no-reply@example.com>",
				to: [to],
				subject: "Alert",
				bounce: { message: "Mailbox does not exist", subType: "General", type },
			},
		},
	} as never;
}

test("hard bounces and complaints suppress notification emails but not auth codes", async () => {
	const { t, manager } = await fixture({ criticalAlerts: true });
	vi.spyOn(console, "warn").mockImplementation(() => {});
	// Transient bounces are ignored.
	await t.mutation(internal.notifications.suppression.onEmailEvent, bounceEvent("Manager@Example.com", "Transient"));
	expect(await t.run((ctx) => ctx.db.query("emailSuppressions").collect())).toEqual([]);
	await t.mutation(internal.notifications.suppression.onEmailEvent, bounceEvent("Moe <Manager@Example.com>", "Permanent"));
	const now = new Date().toISOString();
	await t.mutation(internal.notifications.suppression.onEmailEvent, {
		id: "email-id-2",
		event: {
			type: "email.complained",
			created_at: now,
			data: { created_at: now, email_id: "re_456", from: "x@example.com", to: "admin@example.com", subject: "Digest" },
		},
	} as never);
	const rows = await t.run((ctx) => ctx.db.query("emailSuppressions").collect());
	expect(rows.map((row) => [row.email, row.reason]).sort()).toEqual([
		["admin@example.com", "complained"],
		["manager@example.com", "bounced"],
	]);
	const feedbackId = await logCritical(t, manager);
	expect(await t.mutation(internal.notifications.critical.sendCriticalAlert, { feedbackId, priority: "Critical" })).toEqual([]);
	expect(await t.withIdentity({ subject: manager }).query(api.notifications.preferences.get, { projectSlug: "portal" }))
		.toMatchObject({ suppressed: true });
	// Auth codes still go out to a suppressed address.
	await t.mutation(internal.email.send.sendAuthCode, {
		purpose: "reset", email: "manager@example.com", code: "12345678", expiresAt: Date.now() + 600_000,
	});
	expect(loggedEmails().some((line) => line.includes("to=manager@example.com") && line.includes("12345678"))).toBe(true);
});

test("resend webhook refuses unsigned or unconfigured requests", async () => {
	const { t } = await fixture();
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	const body = JSON.stringify({ type: "email.bounced", data: {} });
	expect((await t.fetch("/resend-webhook", { method: "POST", body })).status).toBe(503);
	vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ=");
	const response = await t.fetch("/resend-webhook", {
		method: "POST",
		body,
		headers: {
			"svix-id": "msg_1",
			"svix-timestamp": String(Math.floor(Date.now() / 1000)),
			"svix-signature": "v1,bm90LWEtc2lnbmF0dXJl",
		},
	});
	expect(response.status).toBe(400);
	expect(await t.run((ctx) => ctx.db.query("emailSuppressions").collect())).toEqual([]);
});

test("retention purge trims the alert ledger", async () => {
	const { t, manager, portal } = await fixture({ criticalAlerts: true });
	const feedbackId = await logCritical(t, manager);
	await t.run(async (ctx) => {
		await ctx.db.insert("criticalAlertLog", { projectId: portal, feedbackId, state: "sent", at: Date.now() - 3 * 24 * 60 * 60 * 1000 });
		await ctx.db.insert("criticalAlertLog", { projectId: portal, feedbackId, state: "sent", at: Date.now() });
	});
	expect(await t.mutation(internal.notifications.retention.purgeAlertLog, {})).toBe(1);
	expect(await t.run((ctx) => ctx.db.query("criticalAlertLog").collect())).toHaveLength(1);
	await t.mutation(internal.notifications.retention.purge, {});
	expect((await scheduled(t, "cleanupOldEmails")).length + (await scheduled(t, "purgeAlertLog")).length).toBeGreaterThan(0);
});
