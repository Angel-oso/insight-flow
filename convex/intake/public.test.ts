import { convexTest } from "convex-test";
import { api } from "../_generated/api";
import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import schema from "../schema";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./intake/"), load])),
};
const { submit, form } = api.intake.public;
const valid = {
	projectSlug: "public-project", title: "  A useful suggestion  ",
	description: "  Please improve the feedback workflow.  ", category: "idea",
};

async function fixture() {
	const t = convexTest(schema, modules);
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

test("anonymous submit creates feedback and one received activity with org defaults", async () => {
	const { t, projectId } = await fixture();
	const result = await t.mutation(submit, { ...valid, senderName: "  Ada  ", senderEmail: " ADA@EXAMPLE.COM " });
	const { feedback, activities } = await stored(t);
	expect(feedback).toHaveLength(1);
	expect(feedback[0]).toMatchObject({ projectId, title: "A useful suggestion", description: "Please improve the feedback workflow.", category: "idea", status: "incoming", priority: "urgent", assigneeId: null, sender: { name: "Ada", email: "ada@example.com" } });
	expect(feedback[0].receivedAt).toBe(feedback[0].updatedAt);
	expect(result.reference).toBe(feedback[0]._id);
	expect(activities).toHaveLength(1);
	expect(activities[0]).toMatchObject({ projectId, feedbackId: feedback[0]._id, actorId: null, type: "received", message: "Received through the public link", createdAt: feedback[0].receivedAt });
});

test("form exposes only safe fields and this organization's category options", async () => {
	const { t, projectId } = await fixture();
	expect(await t.query(form, { projectSlug: valid.projectSlug })).toEqual({ name: "Public Project", description: "Tell us what could be better.", accepting: true, categories: [{ value: "idea", label: "An idea", description: "Suggest something new." }] });
	await t.run((ctx) => ctx.db.patch("projects", projectId, { status: "Paused" }));
	expect((await t.query(form, { projectSlug: valid.projectSlug }))?.accepting).toBe(false);
	expect(await t.query(form, { projectSlug: "unknown" })).toBeNull();
});

for (const changes of [{ status: "Paused" }, { status: "Archived" }, { inboxEnabled: false }] as const) {
	test(`closed intake rejects submissions without writes: ${JSON.stringify(changes)}`, async () => {
		const { t, projectId } = await fixture();
		await t.run((ctx) => ctx.db.patch("projects", projectId, changes));
		expect((await t.query(form, { projectSlug: valid.projectSlug }))?.accepting).toBe(false);
		await expect(t.mutation(submit, valid)).rejects.toThrow("This feedback link is not accepting submissions.");
		expect(await stored(t)).toEqual({ feedback: [], activities: [] });
	});
}

for (const [label, changes] of [
	["unknown slug", { projectSlug: "unknown" }], ["unknown category", { category: "private" }],
	["short title", { title: "  ab  " }], ["long title", { title: "a".repeat(121) }],
	["short description", { description: " short " }], ["long description", { description: "a".repeat(5001) }],
	["invalid email", { senderEmail: "invalid@" }], ["long email", { senderEmail: `${"a".repeat(243)}@example.com` }],
	["long name", { senderName: "a".repeat(81) }],
] as const) {
	test(`invalid submission rejects with ConvexError and no writes: ${label}`, async () => {
		const { t } = await fixture();
		await expect(t.mutation(submit, { ...valid, ...changes })).rejects.toBeInstanceOf(ConvexError);
		expect(await stored(t)).toEqual({ feedback: [], activities: [] });
	});
}

test("honeypot returns a reference without inserting anything", async () => {
	const { t } = await fixture();
	expect((await t.mutation(submit, { ...valid, website: "https://spam.example" })).reference).toEqual(expect.any(String));
	expect(await stored(t)).toEqual({ feedback: [], activities: [] });
});

test("missing default priority falls back to lowest rank and blank sender is null", async () => {
	const { t, projectId } = await fixture();
	await t.run((ctx) => ctx.db.patch("projects", projectId, { defaultPriority: "removed" }));
	await t.mutation(submit, { ...valid, senderName: " ", senderEmail: " " });
	expect((await stored(t)).feedback[0]).toMatchObject({ priority: "routine", sender: null });
});

for (const [sender, expected] of [
	[{ senderName: "Ada" }, { name: "Ada", email: "" }],
	[{ senderEmail: "ada@example.com" }, { name: "", email: "ada@example.com" }],
] as const) {
	test(`one optional sender field preserves the other as empty: ${JSON.stringify(sender)}`, async () => {
		const { t } = await fixture();
		await t.mutation(submit, { ...valid, ...sender });
		expect((await stored(t)).feedback[0].sender).toEqual(expected);
	});
}

test("exact trimmed input limits are accepted", async () => {
	const { t } = await fixture();
	await t.mutation(submit, { ...valid, title: " abc ", description: " 0123456789 " });
	await t.mutation(submit, { ...valid, title: "a".repeat(120), description: "a".repeat(5000), senderName: "a".repeat(80), senderEmail: `${"a".repeat(242)}@example.com` });
	expect((await stored(t)).feedback).toHaveLength(2);
});

test("a full inbox rejects new submissions so the team's views keep working", async () => {
	const { t, projectId } = await fixture();
	await t.run(async (ctx) => {
		for (let i = 0; i < 200; i += 1) {
			await ctx.db.insert("feedback", {
				projectId, title: `Item ${i}`, description: "Existing feedback item.", category: "idea",
				priority: "routine", status: "incoming", assigneeId: null, sender: null,
				receivedAt: i, updatedAt: i,
			});
		}
	});
	const before = await stored(t);
	await expect(t.mutation(submit, valid)).rejects.toThrow(
		"This project's inbox is full. Close or discard older feedback first.",
	);
	const after = await stored(t);
	expect(after.feedback).toHaveLength(before.feedback.length);
	expect(after.activities).toHaveLength(before.activities.length);
});
