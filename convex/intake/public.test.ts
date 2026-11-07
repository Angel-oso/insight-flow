import { newConvexTest } from "../../test/convex-test";
import { api } from "../_generated/api";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TURNSTILE_VERIFY_URL } from "./captcha";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./intake/"), load])),
};
const { submit, form } = api.intake.public;
const valid = {
	projectSlug: "public-project", title: "  A useful suggestion  ",
	description: "  Please improve the feedback workflow.  ", category: "idea",
};

beforeEach(() => {
	// Most tests exercise intake logic, not the captcha: use the dev escape hatch.
	vi.stubEnv("TURNSTILE_SECRET_KEY", "");
	vi.stubEnv("INTAKE_CAPTCHA_DISABLED", "true");
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

async function fixture() {
	const t = newConvexTest(modules);
	const projectId = await t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", { name: "Owner" });
		const organizationId = await ctx.db.insert("organizations", { name: "Workspace", slug: "workspace", ownerId });
		for (const [key, items] of [
			["status", [{ value: "later", label: "Later", rank: 9, tone: "muted" }, { value: "incoming", label: "Incoming", rank: 2, tone: "info" }]],
			["priority", [{ value: "urgent", label: "Urgent", rank: 8, tone: "danger" }, { value: "routine", label: "Routine", rank: 1, tone: "muted" }]],
			["category", [{ value: "idea", label: "An idea", rank: 0, tone: "primary", description: "Suggest something new." }]],
		] as const) {
			await ctx.db.insert("taxonomies", { organizationId, key, label: key, items: items.map((item) => ({ ...item })) });
		}
		const otherOrg = await ctx.db.insert("organizations", { name: "Other", slug: "other", ownerId });
		await ctx.db.insert("taxonomies", { organizationId: otherOrg, key: "category", label: "Category", items: [{ value: "private", label: "Other org only", rank: 0, tone: "muted" }] });
		return ctx.db.insert("projects", {
			organizationId, name: "Public Project", slug: valid.projectSlug, description: "Tell us what could be better.",
			status: "Active", inboxEnabled: true, defaultPriority: "urgent", criticalAlerts: false, weeklyDigest: false,
		});
	});
	return { t, projectId };
}

async function stored(t: Awaited<ReturnType<typeof fixture>>["t"]) {
	return t.run(async (ctx) => ({ feedback: await ctx.db.query("feedback").collect(), activities: await ctx.db.query("activities").collect() }));
}

function mockSiteverify(response: Response | Error) {
	const fetchMock = vi.fn(async () => {
		if (response instanceof Error) throw response;
		return response.clone();
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("anonymous submit creates feedback and one received activity with org defaults", async () => {
	const { t, projectId } = await fixture();
	const result = await t.action(submit, { ...valid, senderName: "  Ada  ", senderEmail: " ADA@EXAMPLE.COM " });
	const { feedback, activities } = await stored(t);
	expect(feedback).toHaveLength(1);
	expect(feedback[0]).toMatchObject({ projectId, title: "A useful suggestion", description: "Please improve the feedback workflow.", category: "idea", status: "incoming", priority: "urgent", assigneeId: null, sender: { name: "Ada", email: "ada@example.com" } });
	expect(feedback[0].receivedAt).toBe(feedback[0].updatedAt);
	expect(result.reference).toBe(feedback[0]._id);
	expect(activities).toHaveLength(1);
	expect(activities[0]).toMatchObject({ projectId, feedbackId: feedback[0]._id, actorId: null, type: "received", message: "Received through the public link", createdAt: feedback[0].receivedAt });
});

test("form exposes only safe fields and this organization's category options", async () => {
	const { t } = await fixture();
	expect(await t.query(form, { projectSlug: valid.projectSlug })).toEqual({ name: "Public Project", description: "Tell us what could be better.", accepting: true, categories: [{ value: "idea", label: "An idea", description: "Suggest something new." }] });
});

test("form reveals nothing for unknown or closed links (no existence oracle)", async () => {
	const { t, projectId } = await fixture();
	expect(await t.query(form, { projectSlug: "unknown" })).toEqual({ accepting: false });
	for (const changes of [{ status: "Paused" }, { status: "Archived" }, { status: "Active", inboxEnabled: false }] as const) {
		await t.run((ctx) => ctx.db.patch("projects", projectId, changes));
		expect(await t.query(form, { projectSlug: valid.projectSlug })).toEqual({ accepting: false });
	}
});

for (const changes of [{ status: "Paused" }, { status: "Archived" }, { inboxEnabled: false }] as const) {
	test(`closed intake rejects submissions without writes: ${JSON.stringify(changes)}`, async () => {
		const { t, projectId } = await fixture();
		await t.run((ctx) => ctx.db.patch("projects", projectId, changes));
		await expect(t.action(submit, valid)).rejects.toThrow("This feedback link is not accepting submissions.");
		expect(await stored(t)).toEqual({ feedback: [], activities: [] });
	});
}

test("unknown slugs fail with the same message as closed links", async () => {
	const { t } = await fixture();
	await expect(t.action(submit, { ...valid, projectSlug: "unknown" })).rejects.toThrow("This feedback link is not accepting submissions.");
});

for (const [label, changes] of [
	["unknown slug", { projectSlug: "unknown" }], ["unknown category", { category: "private" }],
	["short title", { title: "  ab  " }], ["long title", { title: "a".repeat(121) }],
	["short description", { description: " short " }], ["long description", { description: "a".repeat(5001) }],
	["invalid email", { senderEmail: "invalid@" }], ["long email", { senderEmail: `${"a".repeat(243)}@example.com` }],
	["long name", { senderName: "a".repeat(81) }],
] as const) {
	test(`invalid submission rejects with ConvexError and no writes: ${label}`, async () => {
		const { t } = await fixture();
		await expect(t.action(submit, { ...valid, ...changes })).rejects.toBeInstanceOf(ConvexError);
		expect(await stored(t)).toEqual({ feedback: [], activities: [] });
	});
}

test("honeypot returns a reference without inserting anything", async () => {
	const { t } = await fixture();
	expect((await t.action(submit, { ...valid, website: "https://spam.example" })).reference).toEqual(expect.any(String));
	expect(await stored(t)).toEqual({ feedback: [], activities: [] });
});

test("missing default priority falls back to lowest rank and blank sender is null", async () => {
	const { t, projectId } = await fixture();
	await t.run((ctx) => ctx.db.patch("projects", projectId, { defaultPriority: "removed" }));
	await t.action(submit, { ...valid, senderName: " ", senderEmail: " " });
	expect((await stored(t)).feedback[0]).toMatchObject({ priority: "routine", sender: null });
});

for (const [sender, expected] of [
	[{ senderName: "Ada" }, { name: "Ada", email: "" }],
	[{ senderEmail: "ada@example.com" }, { name: "", email: "ada@example.com" }],
] as const) {
	test(`one optional sender field preserves the other as empty: ${JSON.stringify(sender)}`, async () => {
		const { t } = await fixture();
		await t.action(submit, { ...valid, ...sender });
		expect((await stored(t)).feedback[0].sender).toEqual(expected);
	});
}

test("exact trimmed input limits are accepted", async () => {
	const { t } = await fixture();
	await t.action(submit, { ...valid, title: " abc ", description: " 0123456789 " });
	await t.action(submit, { ...valid, title: "a".repeat(120), description: "a".repeat(5000), senderName: "a".repeat(80), senderEmail: `${"a".repeat(242)}@example.com` });
	expect((await stored(t)).feedback).toHaveLength(2);
});

// --- Captcha -----------------------------------------------------------------

test("captcha fails closed when no secret is configured and the escape hatch is off", async () => {
	const { t } = await fixture();
	const fetchMock = mockSiteverify(json({ success: true }));
	for (const disabled of ["", "1", "TRUE", "yes"]) {
		vi.stubEnv("INTAKE_CAPTCHA_DISABLED", disabled);
		await expect(t.action(submit, { ...valid, captchaToken: "token" })).rejects.toThrow(/temporarily unavailable/i);
	}
	expect(fetchMock).not.toHaveBeenCalled();
	expect(await stored(t)).toEqual({ feedback: [], activities: [] });
});

test("captcha is required when a secret is configured", async () => {
	const { t } = await fixture();
	vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
	const fetchMock = mockSiteverify(json({ success: true }));
	await expect(t.action(submit, valid)).rejects.toThrow(/verify that you're human/i);
	expect(fetchMock).not.toHaveBeenCalled();
	expect(await stored(t)).toEqual({ feedback: [], activities: [] });
});

test("a valid captcha token is verified server-side before the feedback is stored", async () => {
	const { t } = await fixture();
	vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
	vi.stubEnv("INTAKE_CAPTCHA_DISABLED", "true"); // ignored once a secret exists
	const fetchMock = mockSiteverify(json({ success: true, action: "intake" }));
	await t.action(submit, { ...valid, captchaToken: "good-token" });
	expect(fetchMock).toHaveBeenCalledTimes(1);
	const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
	expect(url).toBe(TURNSTILE_VERIFY_URL);
	expect(init.method).toBe("POST");
	const body = new URLSearchParams(String(init.body));
	expect(body.get("secret")).toBe("secret-key");
	expect(body.get("response")).toBe("good-token");
	expect((await stored(t)).feedback).toHaveLength(1);
});

for (const [label, response] of [
	["rejected token", json({ success: false, "error-codes": ["invalid-input-response"] })],
	["wrong widget action", json({ success: true, action: "login" })],
	["siteverify outage", json({}, 500)],
	["network failure", new Error("network down")],
] as const) {
	test(`siteverify failure rejects without writes: ${label}`, async () => {
		const { t } = await fixture();
		vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
		mockSiteverify(response);
		await expect(t.action(submit, { ...valid, captchaToken: "token" })).rejects.toThrow(/verify that you're human/i);
		expect(await stored(t)).toEqual({ feedback: [], activities: [] });
	});
}

// --- Rate limits ---------------------------------------------------------------

test("per-project rate limit tolerates a burst then blocks a flood", async () => {
	const { t } = await fixture();
	for (let i = 0; i < 25; i += 1) await t.action(submit, valid);
	await expect(t.action(submit, valid)).rejects.toThrow(/lot of submissions.*try again in/i);
	expect((await stored(t)).feedback).toHaveLength(25);
});

test("per-sender rate limit caps one email address without blocking others", async () => {
	const { t } = await fixture();
	for (let i = 0; i < 3; i += 1) await t.action(submit, { ...valid, senderEmail: "ada@example.com" });
	await expect(t.action(submit, { ...valid, senderEmail: " ADA@example.com " })).rejects.toThrow(/several submissions.*try again in/i);
	await t.action(submit, { ...valid, senderEmail: "grace@example.com" });
	await t.action(submit, valid);
	expect((await stored(t)).feedback).toHaveLength(5);
});

test("invalid submissions do not consume the project's rate limit", async () => {
	const { t } = await fixture();
	for (let i = 0; i < 30; i += 1) {
		await expect(t.action(submit, { ...valid, category: "private" })).rejects.toBeInstanceOf(ConvexError);
	}
	await t.action(submit, valid);
	expect((await stored(t)).feedback).toHaveLength(1);
});
