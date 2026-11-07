/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { workspaceFixture } from "../../test/attachments-integrations-fixture";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { MAX_ATTACHMENT_BYTES } from "./model";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./attachments/"), load])),
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const PDF = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n1 0 obj\n");
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

const ORIGIN = "https://app.example.com";

beforeEach(() => {
	vi.stubEnv("CONVEX_SITE_URL", "https://files.example.convex.site");
	vi.stubEnv("SITE_URL", ORIGIN);
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

type Fixture = Awaited<ReturnType<typeof workspaceFixture>>;
type Caller = Fixture["member"];

/** Stores a file directly (bypassing the route), for sweep/verify tests. */
async function store(f: Fixture, bytes: Uint8Array, type: string) {
	return await f.t.run((ctx) => ctx.storage.store(new Blob([bytes as BlobPart], { type })));
}

async function ticketFor(f: Fixture, who: Caller = f.member) {
	return await who.mutation(api.attachments.files.createUploadTicket, { projectSlug: f.projectSlug, feedbackId: f.feedbackId });
}

function post(
	who: Caller,
	ticket: string,
	bytes: Uint8Array,
	type: string,
	options: { fileName?: string; length?: number; origin?: string | null } = {},
) {
	const headers: Record<string, string> = {
		"Content-Type": type,
		"Content-Length": String(options.length ?? bytes.byteLength),
		"X-Upload-Ticket": ticket,
		"X-File-Name": encodeURIComponent(options.fileName ?? "shot.png"),
	};
	if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
	return who.fetch("/attachments/upload", { method: "POST", headers, body: bytes as BodyInit });
}

type UploadResult = { ok: true; attachmentId: Id<"feedbackAttachments"> } | { ok: false; error: string };

/** Full upload flow: ticket, route, scheduled verification. */
async function upload(f: Fixture, bytes: Uint8Array, type: string, fileName = "shot.png") {
	const { ticket } = await ticketFor(f);
	const response = await post(f.member, ticket, bytes, type, { fileName });
	const result = (await response.json()) as UploadResult;
	const storageId = result.ok
		? (await f.t.run((ctx) => ctx.db.get("feedbackAttachments", result.attachmentId)))!.storageId
		: null;
	await f.t.finishAllScheduledFunctions(() => {});
	return { response, result, storageId: storageId! };
}

async function fileExists(f: Fixture, storageId: Id<"_storage">) {
	return await f.t.run(async (ctx) => (await ctx.db.system.get("_storage", storageId)) !== null);
}

async function storedFiles(f: Fixture) {
	return await f.t.run(async (ctx) => (await ctx.db.system.query("_storage").take(100)).length);
}

test("only members with feedback.update can get upload tickets", async () => {
	const f = await workspaceFixture(modules);
	const args = { projectSlug: f.projectSlug, feedbackId: f.feedbackId };
	const issued = await f.member.mutation(api.attachments.files.createUploadTicket, args);
	expect(issued.uploadUrl).toBe("https://files.example.convex.site/attachments/upload");
	expect(issued.ticket).toMatch(/^[0-9a-f]{64}$/);
	// Only the hash is stored.
	const rows = await f.t.run((ctx) => ctx.db.query("attachmentUploadTickets").collect());
	expect(rows).toHaveLength(1);
	expect(rows[0].tokenHash).not.toBe(issued.ticket);
	await expect(f.viewer.mutation(api.attachments.files.createUploadTicket, args)).rejects.toThrow(/cannot make this change/);
	await expect(f.outsider.mutation(api.attachments.files.createUploadTicket, args)).rejects.toThrow();
	await expect(f.t.mutation(api.attachments.files.createUploadTicket, args)).rejects.toThrow(/Sign in/);
});

test("the upload route stores and registers a valid file", async () => {
	const f = await workspaceFixture(modules);
	const { response, result, storageId } = await upload(f, PNG, "image/png", "../shot.png");
	expect(response.status).toBe(200);
	expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
	expect(result.ok).toBe(true);
	expect(await fileExists(f, storageId)).toBe(true);
	const listed = await f.viewer.query(api.attachments.files.list, { projectSlug: f.projectSlug, feedbackId: f.feedbackId });
	expect(listed.attachments).toMatchObject([{ fileName: "shot.png", contentType: "image/png", verified: true, uploadedBy: "Mia" }]);
	expect(await f.t.run((ctx) => ctx.db.query("attachmentUploadTickets").collect())).toEqual([]);
});

test("oversized uploads are rejected before anything is stored", async () => {
	const f = await workspaceFixture(modules);
	const big = new Uint8Array(MAX_ATTACHMENT_BYTES + 1);
	big.set(PNG);
	// By Content-Length, before the ticket is used or the body read.
	const { ticket } = await ticketFor(f);
	const byHeader = await post(f.member, ticket, big, "image/png");
	expect(byHeader.status).toBe(413);
	expect(await byHeader.json()).toEqual({ ok: false, error: "Files can be at most 10 MB." });
	// A lying Content-Length is caught while reading the body.
	const byBody = await post(f.member, ticket, big, "image/png", { length: 100 });
	expect(byBody.status).toBe(413);
	expect(await storedFiles(f)).toBe(0);
	expect(await f.t.run((ctx) => ctx.db.query("feedbackAttachments").collect())).toEqual([]);
	// A missing size is refused too.
	const noLength = await f.member.fetch("/attachments/upload", {
		method: "POST",
		headers: { Origin: ORIGIN, "Content-Type": "image/png", "X-Upload-Ticket": (await ticketFor(f)).ticket },
	});
	expect(noLength.status).toBe(411);
});

test("upload tickets are single-use, expire and belong to one user", async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	const f = await workspaceFixture(modules);
	const { ticket } = await ticketFor(f);
	// Someone else (or nobody) presenting the ticket is refused and does not burn it.
	expect((await post(f.owner, ticket, PNG, "image/png")).status).toBe(403);
	expect((await post(f.outsider, ticket, PNG, "image/png")).status).toBe(403);
	expect((await post(f.t, ticket, PNG, "image/png")).status).toBe(403);
	expect((await post(f.member, "f".repeat(64), PNG, "image/png")).status).toBe(403);
	expect((await post(f.member, "not-a-ticket", PNG, "image/png")).status).toBe(401);
	expect(await storedFiles(f)).toBe(0);

	expect((await post(f.member, ticket, PNG, "image/png")).status).toBe(200);
	// Second use of the same ticket.
	expect((await post(f.member, ticket, PNG, "image/png")).status).toBe(403);
	expect(await storedFiles(f)).toBe(1);

	const late = await ticketFor(f);
	vi.setSystemTime(late.expiresAt + 1);
	const expired = await post(f.member, late.ticket, PNG, "image/png");
	expect(expired.status).toBe(403);
	expect(await expired.json()).toEqual({ ok: false, error: expect.stringMatching(/expired/) });
	expect(await storedFiles(f)).toBe(1);
	// The sweep drops expired tickets.
	await ticketFor(f);
	vi.setSystemTime(Date.now() + 60 * 60_000);
	await f.t.mutation(internal.attachments.cleanup.sweepOrphans, {});
	expect(await f.t.run((ctx) => ctx.db.query("attachmentUploadTickets").collect())).toEqual([]);
});

test("access lost after the ticket was issued deletes the stored file", async () => {
	const f = await workspaceFixture(modules);
	const { ticket } = await ticketFor(f);
	await f.t.run(async (ctx) => {
		const row = (await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", f.projectId).eq("userId", f.memberId))
			.unique())!;
		await ctx.db.delete("projectMembers", row._id);
	});
	const response = await post(f.member, ticket, PNG, "image/png");
	expect(response.status).toBe(403);
	expect(await storedFiles(f)).toBe(0);
});

test("CORS: only the app origin may upload", async () => {
	const f = await workspaceFixture(modules);
	const preflight = await f.t.fetch("/attachments/upload", {
		method: "OPTIONS",
		headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" },
	});
	expect(preflight.status).toBe(204);
	expect(preflight.headers.get("access-control-allow-origin")).toBe(ORIGIN);
	expect(preflight.headers.get("access-control-allow-methods")).toBe("POST");
	expect(preflight.headers.get("access-control-allow-headers")).toContain("X-Upload-Ticket");
	expect(preflight.headers.get("access-control-allow-headers")).toContain("Authorization");

	const evil = await f.t.fetch("/attachments/upload", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
	expect(evil.status).toBe(403);
	expect(evil.headers.get("access-control-allow-origin")).toBeNull();
	const { ticket } = await ticketFor(f);
	expect((await post(f.member, ticket, PNG, "image/png", { origin: "https://evil.example" })).status).toBe(403);
	expect(await storedFiles(f)).toBe(0);
});

test("the route validates type, contents and the per-item cap", async () => {
	const f = await workspaceFixture(modules);
	const html = await upload(f, HTML, "text/html", "x.html");
	expect(html.result).toEqual({ ok: false, error: expect.stringMatching(/PNG, JPEG/) });
	const svg = await upload(f, new TextEncoder().encode("<svg/>"), "image/svg+xml", "x.svg");
	expect(svg.result.ok).toBe(false);
	// Disguised file: declared PNG, HTML bytes. Rejected before storing.
	const disguised = await upload(f, HTML, "image/png", "innocent.png");
	expect(disguised.result).toEqual({ ok: false, error: expect.stringMatching(/do not match/) });
	expect(await storedFiles(f)).toBe(0);

	for (let index = 0; index < 5; index++) {
		const { result } = await upload(f, index % 2 ? PDF : PNG, index % 2 ? "application/pdf" : "image/png", `../../etc/f${index}‮.png`);
		expect(result.ok).toBe(true);
	}
	await expect(ticketFor(f)).rejects.toThrow(/at most 5/);

	const listed = await f.viewer.query(api.attachments.files.list, { projectSlug: f.projectSlug, feedbackId: f.feedbackId });
	expect(listed.canManage).toBe(false);
	expect(listed.attachments).toHaveLength(5);
	// Paths and bidi overrides are stripped from display names.
	expect(listed.attachments[0].fileName).toBe("f0.png");
	expect(listed.attachments.every((row) => row.verified)).toBe(true);
	await expect(f.outsider.query(api.attachments.files.list, { projectSlug: f.projectSlug, feedbackId: f.feedbackId })).rejects.toThrow();
});

test("a stored file whose bytes do not match its type fails verification", async () => {
	const f = await workspaceFixture(modules);
	const storageId = await store(f, HTML, "image/png");
	const result = await f.member.mutation(internal.attachments.files.completeUpload, {
		projectSlug: f.projectSlug, feedbackId: f.feedbackId, storageId, fileName: "innocent.png", contentType: "image/png",
	});
	expect(result.ok).toBe(true);
	await f.t.finishAllScheduledFunctions(() => {});
	expect(await f.t.run((ctx) => ctx.db.query("feedbackAttachments").collect())).toEqual([]);
	expect(await fileExists(f, storageId)).toBe(false);
});

test("download links are short-lived, signed and only issued to viewers", async () => {
	const f = await workspaceFixture(modules);
	await upload(f, PNG, "image/png", "shot.png");
	await upload(f, PDF, "application/pdf", "report.pdf");
	const args = { projectSlug: f.projectSlug, feedbackId: f.feedbackId };
	await expect(f.outsider.mutation(api.attachments.files.issueUrls, args)).rejects.toThrow();
	await expect(f.t.mutation(api.attachments.files.issueUrls, args)).rejects.toThrow(/Sign in/);
	const { urls, expiresAt } = await f.viewer.mutation(api.attachments.files.issueUrls, args);
	expect(urls).toHaveLength(2);
	expect(expiresAt - Date.now()).toBeLessThanOrEqual(15 * 60_000);
	const path = (url: string) => {
		const parsed = new URL(url);
		expect(parsed.origin).toBe("https://files.example.convex.site");
		return parsed.pathname + parsed.search;
	};

	const image = await f.t.fetch(path(urls[0].url));
	expect(image.status).toBe(200);
	expect(image.headers.get("content-type")).toBe("image/png");
	expect(image.headers.get("x-content-type-options")).toBe("nosniff");
	expect(image.headers.get("content-disposition")).toMatch(/^inline/);
	const pdf = await f.t.fetch(path(urls[1].url));
	expect(pdf.headers.get("content-disposition")).toMatch(/^attachment; filename\*=UTF-8''report\.pdf/);
	expect(pdf.headers.get("content-security-policy")).toContain("sandbox");

	// Tampered signature, swapped id and expired links all read as missing.
	const tampered = new URL(urls[0].url);
	tampered.searchParams.set("sig", "0".repeat(64));
	expect((await f.t.fetch(tampered.pathname + tampered.search)).status).toBe(404);
	const swapped = new URL(urls[0].url);
	swapped.searchParams.set("id", urls[1].attachmentId);
	expect((await f.t.fetch(swapped.pathname + swapped.search)).status).toBe(404);
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(expiresAt + 1);
	expect((await f.t.fetch(path(urls[0].url))).status).toBe(404);
});

test("members can remove attachments; viewers cannot", async () => {
	const f = await workspaceFixture(modules);
	const { storageId, result } = await upload(f, PNG, "image/png");
	if (!result.ok) throw new Error("upload failed");
	const args = { projectSlug: f.projectSlug, attachmentId: result.attachmentId };
	await expect(f.viewer.mutation(api.attachments.files.remove, args)).rejects.toThrow(/cannot make this change/);
	await f.member.mutation(api.attachments.files.remove, args);
	expect(await fileExists(f, storageId)).toBe(false);
});

test("deleting feedback removes attachment rows and files", async () => {
	const f = await workspaceFixture(modules);
	const a = await upload(f, PNG, "image/png");
	const b = await upload(f, PDF, "application/pdf");
	await f.owner.mutation(api.feedback.deletion.remove, { projectSlug: f.projectSlug, feedbackId: f.feedbackId });
	expect(await fileExists(f, a.storageId)).toBe(false);
	expect(await fileExists(f, b.storageId)).toBe(false);
	expect(await f.t.run((ctx) => ctx.db.query("feedbackAttachments").collect())).toEqual([]);
});

test("project purge removes attachment files and webhooks", async () => {
	const f = await workspaceFixture(modules);
	const a = await upload(f, PNG, "image/png");
	await f.owner.mutation(api.integrations.webhooks.create, {
		projectSlug: f.projectSlug, name: "Ops", url: "https://hooks.example.com/x", format: "json", events: ["feedback.created"],
	});
	await f.t.run(async (ctx) => {
		await ctx.db.patch("projects", f.projectId, { deletionRequestedAt: Date.now(), status: "Archived" });
	});
	for (let step = 0; step < 20; step++) {
		await f.t.mutation(internal.projects.deletion.purge, { projectId: f.projectId });
		if (!(await f.t.run((ctx) => ctx.db.get("projects", f.projectId)))) break;
	}
	await f.t.finishAllScheduledFunctions(() => {});
	expect(await fileExists(f, a.storageId)).toBe(false);
	expect(await f.t.run((ctx) => ctx.db.query("feedbackAttachments").collect())).toEqual([]);
	expect(await f.t.run((ctx) => ctx.db.query("webhooks").collect())).toEqual([]);
});

test("the orphan sweep deletes only old, unregistered uploads", async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	const f = await workspaceFixture(modules);
	const kept = await upload(f, PNG, "image/png");
	const orphan = await store(f, HTML, "text/html");
	// Too recent: an upload may still be registering.
	await f.t.mutation(internal.attachments.cleanup.sweepOrphans, {});
	expect(await fileExists(f, orphan)).toBe(true);
	vi.setSystemTime(Date.now() + 3 * 60 * 60_000);
	const result = await f.t.mutation(internal.attachments.cleanup.sweepOrphans, {});
	expect(result.deleted).toBe(1);
	expect(await fileExists(f, orphan)).toBe(false);
	expect(await fileExists(f, kept.storageId)).toBe(true);
	// The watermark advanced: nothing is re-read on the next run.
	expect((await f.t.mutation(internal.attachments.cleanup.sweepOrphans, {})).checked).toBe(0);
});
