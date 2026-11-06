/**
 * completedAt bookkeeping (open/final transitions and taxonomy isFinal
 * toggles) and the inbox's bounded scan for selective filters.
 */
import { newConvexTest } from "../../test/convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { feedbackByCompleted } from "./aggregates";
import { INBOX_MAX_ROWS_READ, type FeedbackView } from "./queries";
import { insertFeedbackRow } from "./store";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./feedback/"), load])),
};

type Fields = Omit<Doc<"feedback">, "_id" | "_creationTime">;

async function fixture() {
	const t = newConvexTest(modules);
	const ownerId = await t.run((ctx) => ctx.db.insert("users", { name: "Owner", email: "owner@example.com" }));
	const owner = t.withIdentity({ subject: ownerId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, { name: "Acme", projectName: "Portal" });
	const projectId = await t.run(async (ctx) =>
		(await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique())!._id,
	);
	const row = (overrides: Partial<Fields> = {}): Fields => ({
		projectId,
		title: "Item",
		description: "Seeded",
		category: "Bug",
		priority: "Low",
		status: "New",
		assigneeId: null,
		sender: null,
		receivedAt: Date.now(),
		updatedAt: Date.now(),
		...overrides,
	});
	return { t, owner, ownerId, projectSlug, projectId, row };
}

function completedCount(t: ReturnType<typeof newConvexTest>, projectId: Id<"projects">) {
	return t.run((ctx) =>
		feedbackByCompleted.count(ctx, { namespace: projectId, bounds: { lower: { key: 0, inclusive: true } } }),
	);
}

test("completedAt is set on open -> final, kept on final -> final and cleared on final -> open", async () => {
	const { t, owner, projectSlug, projectId, row } = await fixture();
	const feedbackId = await t.run((ctx) => insertFeedbackRow(ctx, row()));
	const read = () => t.run((ctx) => ctx.db.get("feedback", feedbackId));

	await owner.mutation(api.feedback.mutations.update, { projectSlug, feedbackId, changes: { status: "Completed" } });
	const completedAt = (await read())!.completedAt;
	expect(completedAt).toBeTypeOf("number");
	expect(await completedCount(t, projectId)).toBe(1);

	await new Promise((resolve) => setTimeout(resolve, 5));
	await owner.mutation(api.feedback.mutations.update, { projectSlug, feedbackId, changes: { status: "Discarded" } });
	expect((await read())!.completedAt).toBe(completedAt);
	expect(await completedCount(t, projectId)).toBe(1);

	await owner.mutation(api.feedback.mutations.update, { projectSlug, feedbackId, changes: { status: "In review" } });
	expect((await read())!.completedAt).toBeUndefined();
	expect(await completedCount(t, projectId)).toBe(0);
});

test("toggling a status's isFinal syncs completedAt of existing items in batches", async () => {
	const { t, owner, projectSlug, projectId, row } = await fixture();
	const ITEMS = 130; // more than one sync batch
	const ids = await t.run(async (ctx) => {
		const created: Id<"feedback">[] = [];
		for (let index = 0; index < ITEMS; index++)
			created.push(await insertFeedbackRow(ctx, row({ status: "Planned", updatedAt: 1_000 + index })));
		// An item elsewhere stays untouched.
		created.push(await insertFeedbackRow(ctx, row({ status: "New" })));
		return created;
	});

	await owner.mutation(api.taxonomies.mutations.updateOption, {
		projectSlug, key: "status", value: "Planned", isFinal: true,
	});
	await t.finishAllScheduledFunctions(() => {});
	const afterFinal = await t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get("feedback", id))));
	expect(afterFinal.slice(0, ITEMS).every((item) => item!.completedAt === item!.updatedAt)).toBe(true);
	expect(afterFinal[ITEMS]!.completedAt).toBeUndefined();
	expect(await completedCount(t, projectId)).toBe(ITEMS);

	await owner.mutation(api.taxonomies.mutations.updateOption, {
		projectSlug, key: "status", value: "Planned", isFinal: false,
	});
	await t.finishAllScheduledFunctions(() => {});
	const afterOpen = await t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get("feedback", id))));
	expect(afterOpen.every((item) => item!.completedAt === undefined)).toBe(true);
	expect(await completedCount(t, projectId)).toBe(0);
}, 60_000);

test("a selective inbox filter returns short pages instead of scanning without bound", async () => {
	const { t, owner, ownerId, projectSlug, row } = await fixture();
	const now = Date.now();
	await t.run(async (ctx) => {
		// Matches (open, unassigned, Critical: sets the lane, so Low filler is
		// not "high"), received first so they sit behind the filler.
		for (let index = 0; index < 3; index++)
			await insertFeedbackRow(ctx, row({ priority: "Critical", receivedAt: now - 10_000_000 - index, updatedAt: now }));
		// Filler that the attention filter rejects: assigned, fresh, low priority.
		// Inserted without the store for speed; list reads the table only.
		for (let index = 0; index < INBOX_MAX_ROWS_READ + 200; index++)
			await ctx.db.insert("feedback", row({ assigneeId: ownerId, receivedAt: now - index, updatedAt: now }));
	});
	const filters = { attention: { now } };
	const first = await owner.query(api.feedback.queries.list, {
		projectSlug, filters, paginationOpts: { numItems: 10, cursor: null },
	});
	// The page stops at the scan cap: nothing matched yet, but more remain.
	expect(first.page).toEqual([]);
	expect(first.isDone).toBe(false);

	const found: FeedbackView[] = [...first.page];
	let cursor: string | null = first.continueCursor;
	for (let guard = 0; guard < 10; guard++) {
		const page: { page: FeedbackView[]; isDone: boolean; continueCursor: string } = await owner.query(
			api.feedback.queries.list,
			{ projectSlug, filters, paginationOpts: { numItems: 10, cursor } },
		);
		found.push(...page.page);
		if (page.isDone) break;
		cursor = page.continueCursor;
	}
	expect(found).toHaveLength(3);
	expect(found.every((item) => item.assigneeId === null)).toBe(true);
}, 60_000);
