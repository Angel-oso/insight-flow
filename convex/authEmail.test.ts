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
	vi.stubEnv("RESEND_API_KEY", "");
	const t = newConvexTest(modules);
	await expect(
		t.mutation(internal.email.send.sendAuthCode, { ...code, email: "ada@example.com" }),
	).rejects.toThrow(/isn't configured/);
});

test("codes are queued through the Resend component when a key is set", async () => {
	vi.stubEnv("EMAIL_DEV_LOG", "");
	vi.stubEnv("RESEND_API_KEY", "re_test_key");
	vi.stubEnv("RESEND_TEST_MODE", "true");
	const t = newConvexTest(modules);
	await t.mutation(internal.email.send.sendAuthCode, { ...code, email: "delivered@resend.dev" });
	// Test mode refuses real recipients, proving the component path is used.
	await expect(
		t.mutation(internal.email.send.sendAuthCode, { ...code, email: "ada@example.com" }),
	).rejects.toThrow(/test mode/i);
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
