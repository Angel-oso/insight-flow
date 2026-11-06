import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { safeNextPath, withNext } from "./safe-next";

beforeEach(() => {
	vi.stubGlobal("window", { location: { origin: "https://app.example" } });
});
afterEach(() => {
	vi.unstubAllGlobals();
});

test("keeps same-origin paths with their query and hash", () => {
	expect(safeNextPath("/invitations/abc")).toBe("/invitations/abc");
	expect(safeNextPath("/projects/x/feedback?status=new#top")).toBe("/projects/x/feedback?status=new#top");
	expect(safeNextPath("https://app.example/home?x=1")).toBe("/home?x=1");
	expect(safeNextPath("home")).toBe("/home");
});

test("rejects anything that leaves the origin", () => {
	for (const next of [
		"//evil.com",
		"/\\evil.com",
		"\\\\evil.com",
		"/\t/evil.com",
		decodeURIComponent("/%09/evil.com"),
		"https://evil.com/home",
		"https:evil.com",
		"javascript:alert(1)",
		"data:text/html,hi",
		"https://app.example//evil.com",
		"https://app.example.evil.com/",
	]) {
		const result = safeNextPath(next);
		if (result !== null) {
			// Whatever survives must stay on the origin when used as a redirect.
			expect(new URL(result, "https://app.example").origin).toBe("https://app.example");
			expect(result.startsWith("//")).toBe(false);
		}
	}
	expect(safeNextPath("//evil.com")).toBeNull();
	expect(safeNextPath("/\\evil.com")).toBeNull();
	expect(safeNextPath("https://evil.com/home")).toBeNull();
	expect(safeNextPath("javascript:alert(1)")).toBeNull();
	expect(safeNextPath(null)).toBeNull();
	expect(safeNextPath("")).toBeNull();
});

test("withNext carries only safe targets", () => {
	expect(withNext("/signup", "/invitations/abc")).toBe("/signup?next=%2Finvitations%2Fabc");
	expect(withNext("/signup", "//evil.com")).toBe("/signup");
	expect(withNext("/signup", null)).toBe("/signup");
});
