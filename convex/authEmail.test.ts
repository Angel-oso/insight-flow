/** Auth code delivery modes and abuse limits (convex/email/send.ts). */
import { newConvexTest } from "../test/convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const code = { purpose: "verify" as const, code: "12345678", expiresAt: Date.now() + 15 * 60_000 };

beforeEach(() => {
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("dev log mode prints the code instead of sending it", async () => {
	vi.stubEnv("EMAIL_DEV_LOG", "true");
	const t = newConvexTest(modules);
	await t.mutation(internal.email.send.sendAuthCode, { ...code, email: "ada@example.com" });
	const logged = vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
	expect(logged.some((line) => line.includes("to=ada@example.com") && line.includes("12345678"))).toBe(true);
});

test("codes fail loudly when email delivery is not configured", async () => {
	vi.stubEnv("EMAIL_DEV_LOG", "");
	vi.stubEnv("BREVO_API_KEY", "");
	const t = newConvexTest(modules);
	await expect(
		t.mutation(internal.email.send.sendAuthCode, { ...code, email: "ada@example.com" }),
	).rejects.toThrow(/isn't configured/);
	// A key without a sender is not enough either.
	vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
	vi.stubEnv("EMAIL_FROM", "");
	await expect(
		t.mutation(internal.email.send.sendAuthCode, { ...code, email: "ada@example.com" }),
	).rejects.toThrow(/isn't configured/);
});

function stubBrevo(...statuses: number[]) {
	const fetchMock = vi.fn(async () => {
		const status = statuses.shift() ?? 201;
		return new Response(status < 300 ? '{"messageId":"<id>"}' : "error", { status });
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const brevoArgs = {
	from: "InsightFlow <owner@example.com>",
	to: "ada@example.com",
	subject: "Hello",
	html: "<p>Hi</p>",
	text: "Hi",
};

test("codes are sent through the Brevo API once the mutation commits", async () => {
	vi.stubEnv("EMAIL_DEV_LOG", "");
	vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
	vi.stubEnv("EMAIL_FROM", "InsightFlow <owner@example.com>");
	const fetchMock = stubBrevo(201);
	const t = newConvexTest(modules);
	await t.mutation(internal.email.send.sendAuthCode, { ...code, email: "ada@example.com" });
	expect(fetchMock).not.toHaveBeenCalled();
	await t.finishAllScheduledFunctions(() => {});
	expect(fetchMock).toHaveBeenCalledTimes(1);
	const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
	expect(url).toBe("https://api.brevo.com/v3/smtp/email");
	expect((init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test");
	const body = JSON.parse(String(init.body));
	expect(body.sender).toEqual({ name: "InsightFlow", email: "owner@example.com" });
	expect(body.to).toEqual([{ email: "ada@example.com" }]);
	expect(body.textContent).toContain("12345678");
});

test("transient Brevo failures are retried; permanent ones fail the job", async () => {
	vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
	vi.spyOn(console, "warn").mockImplementation(() => {});
	const t = newConvexTest(modules);
	const scheduledSends = () =>
		t.run(async (ctx) =>
			(await ctx.db.system.query("_scheduled_functions").collect())
				.filter((job) => job.name.includes("brevo") && job.state.kind === "pending")
				.map((job) => (job.args[0] as { attempt: number }).attempt),
		);

	stubBrevo(503);
	await t.action(internal.email.brevo.send, { ...brevoArgs, attempt: 0 });
	expect(await scheduledSends()).toEqual([1]);

	stubBrevo(503);
	await expect(t.action(internal.email.brevo.send, { ...brevoArgs, attempt: 4 })).rejects.toThrow(/503/);

	stubBrevo(400);
	await expect(t.action(internal.email.brevo.send, { ...brevoArgs, attempt: 0 })).rejects.toThrow(/400/);
	expect(await scheduledSends()).toEqual([1]);

	await expect(
		t.action(internal.email.brevo.send, { ...brevoArgs, from: "not an address", attempt: 0 }),
	).rejects.toThrow(/EMAIL_FROM/);
});

test("each address can request only a few codes at once", async () => {
	vi.stubEnv("EMAIL_DEV_LOG", "true");
	const t = newConvexTest(modules);
	for (let attempt = 0; attempt < 5; attempt++) {
		await t.mutation(internal.email.send.sendAuthCode, { ...code, email: "ada@example.com" });
	}
	await expect(
		t.mutation(internal.email.send.sendAuthCode, { ...code, email: "ADA@example.com" }),
	).rejects.toThrow(/Too many codes/);
	// Other addresses are unaffected.
	await t.mutation(internal.email.send.sendAuthCode, { ...code, email: "bob@example.com" });
});
