/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { workspaceFixture } from "../../test/attachments-integrations-fixture";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { insertFeedback } from "../feedback/create";
import { attempt } from "./delivery";
import { hmacSha256Hex, signWebhookPayload, webhookUrlFingerprint } from "./signature";
import { maskUrl } from "./webhooks";
import { validateWebhookUrl } from "./url";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./integrations/"), load])),
};

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let respond: () => Response | Promise<Response> = () => new Response("ok", { status: 200 });

beforeEach(() => {
	calls = [];
	respond = () => new Response("ok", { status: 200 });
	vi.stubEnv("EMAIL_DEV_LOG", "true");
	vi.stubEnv("SITE_URL", "https://app.example.com");
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return await respond();
	}));
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("URL validation rejects non-https, private, loopback, metadata and IP-literal hosts", () => {
	const rejected = [
		"http://hooks.example.com/x",
		"https://localhost/x",
		"https://api.localhost/x",
		"https://intranet/x",
		"https://metadata.google.internal/computeMetadata/v1",
		"https://169.254.169.254/latest/meta-data",
		"https://127.0.0.1/x",
		"https://2130706433/x", // 127.0.0.1 in decimal
		"https://0x7f.1/x", // 127.0.0.1 in hex
		"https://10.1.2.3/x",
		"https://172.20.0.1/x",
		"https://192.168.1.10/x",
		"https://100.64.0.1/x",
		"https://0.0.0.0/x",
		"https://[::1]/x",
		"https://[::ffff:127.0.0.1]/x",
		"https://[fd00::1]/x",
		"https://user:pass@hooks.example.com/x",
		"https://hooks.example.com:8443/x",
		"https://printer.local/x",
		"not a url",
		`https://hooks.example.com/${"a".repeat(2100)}`,
	];
	for (const url of rejected) expect(validateWebhookUrl(url), url).toMatchObject({ ok: false });
	for (const url of [
		"https://hooks.slack.com/services/T000/B000/XXXX",
		"https://example.com:443/hook",
		"https://8.8.8.8/hook",
	])
		expect(validateWebhookUrl(url), url).toMatchObject({ ok: true });
});

test("HMAC-SHA256 matches the RFC 4231 vector and signs timestamp.body", async () => {
	expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
		"5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
	);
	expect(await signWebhookPayload("Jefe", 1700000000, "{}")).toBe(
		`sha256=${await hmacSha256Hex("Jefe", "1700000000.{}")}`,
	);
});

test("only project.manage can configure webhooks; secrets and full URLs are never listed", async () => {
	const f = await workspaceFixture(modules);
	const input = {
		projectSlug: f.projectSlug,
		name: "Slack",
		url: "https://hooks.slack.com/services/T000/B000/SECRETPART",
		format: "slack" as const,
		events: ["feedback.created" as const],
	};
	await expect(f.member.mutation(api.integrations.webhooks.create, input)).rejects.toThrow(/cannot make this change/);
	await expect(f.viewer.mutation(api.integrations.webhooks.create, input)).rejects.toThrow();
	await expect(f.outsider.mutation(api.integrations.webhooks.create, input)).rejects.toThrow();
	await expect(f.owner.mutation(api.integrations.webhooks.create, { ...input, url: "https://10.0.0.5/hook" })).rejects.toThrow(/Private/);

	const { webhookId, secret } = await f.owner.mutation(api.integrations.webhooks.create, input);
	expect(secret).toMatch(/^whsec_[0-9a-f]{64}$/);
	const listed = await f.owner.query(api.integrations.webhooks.list, { projectSlug: f.projectSlug });
	expect(JSON.stringify(listed)).not.toContain(secret);
	expect(JSON.stringify(listed)).not.toContain("SECRETPART");
	expect(listed.webhooks[0].urlPreview).toMatch(/^https:\/\/hooks\.slack\.com/);
	expect(await f.member.query(api.integrations.webhooks.list, { projectSlug: f.projectSlug })).toEqual({ canManage: false, webhooks: [] });

	for (const fn of [api.integrations.webhooks.remove, api.integrations.webhooks.sendTest, api.integrations.webhooks.rotateSecret])
		await expect(f.member.mutation(fn, { projectSlug: f.projectSlug, webhookId })).rejects.toThrow();
	await expect(f.member.mutation(api.integrations.webhooks.update, { projectSlug: f.projectSlug, webhookId, enabled: false })).rejects.toThrow();

	await f.owner.mutation(api.integrations.webhooks.create, { ...input, name: "Two" });
	await f.owner.mutation(api.integrations.webhooks.create, { ...input, name: "Three" });
	await expect(f.owner.mutation(api.integrations.webhooks.create, { ...input, name: "Four" })).rejects.toThrow(/at most 3/);

	const audit = await f.t.run((ctx) => ctx.db.query("auditLogs").collect());
	const entries = audit.filter((row) => row.action === "project.integration_changed");
	expect(entries).toHaveLength(3);
	expect(JSON.stringify(entries)).not.toContain("SECRETPART");
});

async function createHook(f: Awaited<ReturnType<typeof workspaceFixture>>, format: "slack" | "json", events: ("feedback.created" | "feedback.critical")[]) {
	return await f.owner.mutation(api.integrations.webhooks.create, {
		projectSlug: f.projectSlug, name: format, url: `https://hooks.example.com/${format}`, format, events,
	});
}

test("new feedback is delivered signed, without the submitter's email", async () => {
	const f = await workspaceFixture(modules);
	const json = await createHook(f, "json", ["feedback.created"]);
	const slack = await createHook(f, "slack", ["feedback.critical"]);
	const create = (priority: string) =>
		f.t.run(async (ctx) => {
			const project = (await ctx.db.get("projects", f.projectId))!;
			return await insertFeedback(ctx, {
				project, title: "Login broken", description: "Cannot log in <!channel> at all.", category: "Bug", priority,
				senderName: "Sam Sender", senderEmail: "sam.sender@example.com", actorId: null, message: "Received",
			});
		});
	await create("Low");
	await f.t.finishAllScheduledFunctions(() => {});
	// Not critical: only the "new feedback" webhook fires.
	expect(calls.map((call) => call.url)).toEqual(["https://hooks.example.com/json"]);
	const [call] = calls;
	const headers = call.init.headers as Record<string, string>;
	const body = call.init.body as string;
	expect(call.init.redirect).toBe("manual");
	expect(headers["X-InsightFlow-Event"]).toBe("feedback.created");
	expect(headers["X-InsightFlow-Signature"]).toBe(
		await signWebhookPayload(json.secret, Number(headers["X-InsightFlow-Timestamp"]), body),
	);
	expect(body).not.toContain("sam.sender@example.com");
	expect(body).not.toContain("Sam Sender");
	expect(JSON.parse(body)).toMatchObject({ event: "feedback.created", feedback: { title: "Login broken" } });

	calls = [];
	await create("Critical");
	await f.t.finishAllScheduledFunctions(() => {});
	expect(calls.map((call) => call.url).sort()).toEqual(["https://hooks.example.com/json", "https://hooks.example.com/slack"]);
	const slackCall = calls.find((call) => call.url.endsWith("/slack"))!;
	const slackBody = JSON.parse(slackCall.init.body as string);
	expect(Object.keys(slackBody)).toEqual(["text"]);
	expect(slackBody.text).toContain("Critical feedback");
	expect(slackBody.text).not.toContain("sam.sender");
	expect((slackCall.init.headers as Record<string, string>)["X-InsightFlow-Signature"]).toBe(
		await signWebhookPayload(slack.secret, Number((slackCall.init.headers as Record<string, string>)["X-InsightFlow-Timestamp"]), slackCall.init.body as string),
	);
});

test("masked URLs keep only the origin and a short path prefix", async () => {
	expect(maskUrl("https://hooks.slack.com/services/T000/B000/SECRETPART")).toBe("https://hooks.slack.com/services/T0…");
	expect(maskUrl("https://example.com/h?token=SECRET")).toBe("https://example.com/h…");
	expect(maskUrl("https://example.com/?token=SECRET#frag")).toBe("https://example.com…");
	expect(maskUrl("https://example.com/hook#SECRET")).toBe("https://example.com/hook…");
	expect(maskUrl("https://example.com/hook")).toBe("https://example.com/hook");
	expect(maskUrl("not a url")).toBe("…");

	const f = await workspaceFixture(modules);
	const { webhookId } = await f.owner.mutation(api.integrations.webhooks.create, {
		projectSlug: f.projectSlug, name: "Q", url: "https://example.com/h?token=QUERYSECRET", format: "json", events: ["feedback.created"],
	});
	await f.owner.mutation(api.integrations.webhooks.update, {
		projectSlug: f.projectSlug, webhookId, url: "https://example.com/h?token=OTHERSECRET",
	});
	const listed = await f.owner.query(api.integrations.webhooks.list, { projectSlug: f.projectSlug });
	expect(JSON.stringify(listed)).not.toContain("token");
	const audit = await f.t.run((ctx) => ctx.db.query("auditLogs").collect());
	expect(JSON.stringify(audit)).not.toMatch(/token|QUERYSECRET|OTHERSECRET/);
});

test("queued deliveries are dropped if the URL changed, the event was unsubscribed or the hook was disabled", async () => {
	const f = await workspaceFixture(modules);
	const { webhookId } = await createHook(f, "json", ["feedback.created"]);
	const queuedFor = await webhookUrlFingerprint("https://hooks.example.com/json");
	const deliver = () =>
		f.t.action(internal.integrations.delivery.deliver, {
			webhookId, urlFingerprint: queuedFor, feedbackId: f.feedbackId, event: "feedback.created", attempt: 1,
		});
	await deliver();
	expect(calls).toHaveLength(1);

	// URL changed after the job was queued: nothing goes to the new address.
	calls = [];
	await f.owner.mutation(api.integrations.webhooks.update, { projectSlug: f.projectSlug, webhookId, url: "https://other.example.com/new" });
	await deliver();
	expect(calls).toHaveLength(0);
	await f.owner.mutation(api.integrations.webhooks.update, { projectSlug: f.projectSlug, webhookId, url: "https://hooks.example.com/json" });

	// No longer subscribed to the event.
	await f.owner.mutation(api.integrations.webhooks.update, { projectSlug: f.projectSlug, webhookId, events: ["feedback.critical"] });
	await deliver();
	expect(calls).toHaveLength(0);
	await f.owner.mutation(api.integrations.webhooks.update, { projectSlug: f.projectSlug, webhookId, events: ["feedback.created"] });

	// Disabled.
	await f.owner.mutation(api.integrations.webhooks.update, { projectSlug: f.projectSlug, webhookId, enabled: false });
	await deliver();
	expect(calls).toHaveLength(0);
	await f.owner.mutation(api.integrations.webhooks.update, { projectSlug: f.projectSlug, webhookId, enabled: true });
	await deliver();
	expect(calls).toHaveLength(1);
});

async function webhook(f: Awaited<ReturnType<typeof workspaceFixture>>, id: Id<"webhooks">) {
	return (await f.t.run((ctx) => ctx.db.get("webhooks", id)))!;
}

test("retryable failures retry with backoff, then count once; 10 in a row disable the webhook", async () => {
	vi.useFakeTimers();
	try {
		const f = await workspaceFixture(modules);
		const { webhookId } = await createHook(f, "json", ["feedback.created"]);
		const urlFingerprint = await webhookUrlFingerprint("https://hooks.example.com/json");
		respond = () => new Response("down", { status: 503 });
		await f.t.action(internal.integrations.delivery.deliver, { webhookId, urlFingerprint, feedbackId: f.feedbackId, event: "feedback.created", attempt: 1 });
		await f.t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(calls).toHaveLength(4); // first try + 3 retries
		expect(new Set(calls.map((call) => (call.init.headers as Record<string, string>)["X-InsightFlow-Delivery"])).size).toBe(1);
		let hook = await webhook(f, webhookId);
		expect(hook.consecutiveFailures).toBe(1);
		expect(hook.lastDelivery).toMatchObject({ ok: false, status: 503 });

		// Redirects are final failures, never followed.
		calls = [];
		respond = () => new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/" } });
		await f.t.run((ctx) => ctx.db.patch("webhooks", webhookId, { consecutiveFailures: 9 }));
		await f.t.action(internal.integrations.delivery.deliver, { webhookId, urlFingerprint, feedbackId: f.feedbackId, event: "feedback.created", attempt: 1 });
		await f.t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(calls).toHaveLength(1);
		hook = await webhook(f, webhookId);
		expect(hook.enabled).toBe(false);
		expect(hook.consecutiveFailures).toBe(10);
		expect(hook.disabledReason).toMatch(/10 failed deliveries/);

		// Disabled webhooks receive nothing; test sends still work and don't count.
		calls = [];
		respond = () => new Response("ok", { status: 200 });
		await f.t.action(internal.integrations.delivery.deliver, { webhookId, urlFingerprint, feedbackId: f.feedbackId, event: "feedback.created", attempt: 1 });
		expect(calls).toHaveLength(0);
		await f.owner.mutation(api.integrations.webhooks.sendTest, { projectSlug: f.projectSlug, webhookId });
		await f.t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(calls).toHaveLength(1);
		hook = await webhook(f, webhookId);
		expect(hook.lastDelivery).toMatchObject({ ok: true, test: true });
		expect(hook.consecutiveFailures).toBe(10);

		// Re-enabling resets the count; a success also resets it.
		await f.owner.mutation(api.integrations.webhooks.update, { projectSlug: f.projectSlug, webhookId, enabled: true });
		hook = await webhook(f, webhookId);
		expect(hook).toMatchObject({ enabled: true, consecutiveFailures: 0 });
	} finally {
		vi.useRealTimers();
	}
});

test("a request with no answer is aborted after 5 seconds as a retryable failure", async () => {
	vi.useFakeTimers();
	try {
		vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
			init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
		})));
		const pending = attempt("https://hooks.example.com/slow", {}, "{}");
		await vi.advanceTimersByTimeAsync(4_999);
		let settled = false;
		void pending.then(() => { settled = true; });
		await Promise.resolve();
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(2);
		expect(await pending).toEqual({ ok: false, error: "No response within 5 seconds.", retryable: true });
	} finally {
		vi.useRealTimers();
	}
});

test("raising an item to the top priority sends feedback.critical once per window", async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	try {
		const f = await workspaceFixture(modules);
		await createHook(f, "json", ["feedback.created"]);
		const slack = await createHook(f, "slack", ["feedback.critical"]);
		const both = await createHook(f, "json", ["feedback.created", "feedback.critical"]);
		const setPriority = async (priority: string) => {
			await f.owner.mutation(api.feedback.mutations.update, {
				projectSlug: f.projectSlug, feedbackId: f.feedbackId, changes: { priority },
			});
			await f.t.finishAllScheduledFunctions(() => {});
		};

		await setPriority("Critical");
		const hookCalls = () => calls.filter((call) => call.url.startsWith("https://hooks.example.com/"));
		expect(hookCalls().map((call) => call.url).sort()).toEqual(["https://hooks.example.com/json", "https://hooks.example.com/slack"]);
		for (const call of hookCalls()) {
			const headers = call.init.headers as Record<string, string>;
			expect(headers["X-InsightFlow-Event"]).toBe("feedback.critical");
			expect(headers["X-InsightFlow-Delivery"]).toMatch(/-feedback\.critical-\d+$/);
			expect(call.init.body as string).not.toContain("sam.sender@example.com");
			expect(call.init.body as string).not.toContain("Sam Sender");
		}
		const slackCall = hookCalls().find((call) => call.url.endsWith("/slack"))!;
		expect(JSON.parse(slackCall.init.body as string).text).toContain("Critical feedback");
		expect(slack.secret).toBeTruthy();
		expect(both.secret).toBeTruthy();

		// Lowering, or toggling back within the window, sends nothing more.
		calls = [];
		await setPriority("High");
		await setPriority("Critical");
		expect(hookCalls()).toEqual([]);

		// After the window it fires again, with a new delivery id.
		await setPriority("High");
		vi.setSystemTime(Date.now() + 6 * 60 * 60_000 + 1);
		await setPriority("Critical");
		expect(hookCalls()).toHaveLength(2);
		expect(await f.t.run((ctx) => ctx.db.query("webhookCriticalLog").collect())).toHaveLength(2);

		// The daily purge keeps rows inside the window and drops older ones.
		vi.setSystemTime(Date.now() + 7 * 60 * 60_000);
		expect(await f.t.mutation(internal.integrations.webhooks.purgeCriticalLog, {})).toBe(1);
	} finally {
		vi.useRealTimers();
	}
});

test("an item created critical is not re-sent when raised again soon after", async () => {
	const f = await workspaceFixture(modules);
	await createHook(f, "slack", ["feedback.critical"]);
	const feedbackId = await f.t.run(async (ctx) => {
		const project = (await ctx.db.get("projects", f.projectId))!;
		return await insertFeedback(ctx, {
			project, title: "Data loss", description: "Everything is gone.", category: "Bug", priority: "Critical",
			senderName: "Sam Sender", senderEmail: "sam.sender@example.com", actorId: null, message: "Received",
		});
	});
	await f.t.finishAllScheduledFunctions(() => {});
	expect(calls.filter((call) => call.url.endsWith("/slack"))).toHaveLength(1);
	calls = [];
	for (const priority of ["High", "Critical"])
		await f.owner.mutation(api.feedback.mutations.update, { projectSlug: f.projectSlug, feedbackId, changes: { priority } });
	await f.t.finishAllScheduledFunctions(() => {});
	expect(calls.filter((call) => call.url.endsWith("/slack"))).toEqual([]);
});
