import { newConvexTest } from "../../test/convex-test";
import { expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { insertFeedbackRow } from "./store";
import type { FeedbackView } from "./queries";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./feedback/"), load])),
};
const day = 86_400_000;
const from = Date.UTC(2026, 5, 1);
const to = from + 10 * day;
const ITEMS = 212;

type Fields = Omit<Doc<"feedback">, "_id" | "_creationTime">;

/** Owner (admin) + member in one project, with ITEMS feedback rows. */
async function fixture() {
	const t = newConvexTest(modules);
	const ownerId = await t.run((ctx) => ctx.db.insert("users", { name: "Owner", email: "owner@example.com", phone: "555-0100" }));
	const owner = t.withIdentity({ subject: ownerId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, { name: "Scale", projectName: "Big" });
	const ids = await t.run(async (ctx) => {
		const project = (await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique())!;
		const memberRole = (await ctx.db.query("roles").withIndex("by_name", (q) => q.eq("name", "member")).first())!._id;
		const memberId = await ctx.db.insert("users", { name: "Mia Member", email: "mia@example.com", emailVerificationTime: 1 });
		await ctx.db.insert("organizationMembers", { organizationId: project.organizationId, userId: memberId, roleIds: [memberRole] });
		await ctx.db.insert("projectMembers", { projectId: project._id, userId: memberId, joinedAt: from });
		const base = (index: number): Fields => ({
			projectId: project._id,
			title: index % 10 === 0 ? `Checkout crash ${index}` : `Idea ${index}`,
			description: "Generated item",
			category: index % 2 === 0 ? "Bug" : "Improvement",
			priority: index % 20 === 2 ? "Critical" : index % 3 === 0 ? "High" : "Low",
			status: index % 4 === 0 ? "Completed" : "New",
			completedAt: index % 4 === 0 ? from + (index % 10) * day : undefined,
			assigneeId: index % 5 === 0 ? memberId : null,
			sender: null,
			receivedAt: from + index * 3_600_000,
			updatedAt: from + index * 3_600_000,
		});
		for (let index = 0; index < ITEMS; index++) await insertFeedbackRow(ctx, base(index));
		return { projectId: project._id, organizationId: project.organizationId, memberId };
	});
	return { t, owner, ownerId, projectSlug, ...ids, member: t.withIdentity({ subject: ids.memberId }) };
}

async function listAll(
	viewer: ReturnType<ReturnType<typeof newConvexTest>["withIdentity"]>,
	projectSlug: string,
	filters: Record<string, unknown> = {},
	numItems = 50,
) {
	const rows: FeedbackView[] = [];
	let cursor: string | null = null;
	for (;;) {
		const page: { page: FeedbackView[]; isDone: boolean; continueCursor: string } = await viewer.query(api.feedback.queries.list, {
			projectSlug,
			filters,
			paginationOpts: { numItems, cursor },
		});
		rows.push(...page.page);
		if (page.isDone) return rows;
		cursor = page.continueCursor;
	}
}

test("inbox pages through more than 200 items newest first without a cap", async () => {
	const { owner, projectSlug } = await fixture();
	const rows = await listAll(owner, projectSlug);
	expect(rows).toHaveLength(ITEMS);
	expect(new Set(rows.map((row) => row._id)).size).toBe(ITEMS);
	expect(rows.map((row) => row.receivedAt)).toEqual([...rows.map((row) => row.receivedAt)].sort((a, b) => b - a));
	const workspace = await owner.query(api.feedback.queries.workspace, { projectSlug });
	expect(workspace.summary).toMatchObject({ total: ITEMS, open: ITEMS * 3 / 4 });
}, 60_000);

test("server filters match a client-side reference for every dimension", async () => {
	const { t, owner, member, projectSlug, memberId } = await fixture();
	const all = await t.run((ctx) => ctx.db.query("feedback").collect());
	const cases: [Record<string, unknown>, (row: Doc<"feedback">) => boolean][] = [
		[{ status: "Completed" }, (row) => row.status === "Completed"],
		[{ priority: "Critical" }, (row) => row.priority === "Critical"],
		[{ category: "Bug" }, (row) => row.category === "Bug"],
		[{ assignee: "unassigned" }, (row) => row.assigneeId === null],
		[{ assignee: memberId }, (row) => row.assigneeId === memberId],
		[{ receivedAfter: from + 100 * 3_600_000 }, (row) => row.receivedAt >= from + 100 * 3_600_000],
		[{ status: "New", priority: "High", category: "Improvement" }, (row) => row.status === "New" && row.priority === "High" && row.category === "Improvement"],
		[{ assignee: memberId, status: "Completed", receivedAfter: from + 50 * 3_600_000 }, (row) => row.assigneeId === memberId && row.status === "Completed" && row.receivedAt >= from + 50 * 3_600_000],
	];
	for (const [filters, predicate] of cases) {
		const ids = (await listAll(owner, projectSlug, filters)).map((row) => row._id).sort();
		expect(ids).toEqual(all.filter(predicate).map((row) => row._id).sort());
	}
	// "me" resolves to the signed-in caller, never to an argument.
	const mine = await listAll(member, projectSlug, { assignee: "me" });
	expect(mine.length).toBe(all.filter((row) => row.assigneeId === memberId).length);
	expect(await listAll(owner, projectSlug, { assignee: "me" })).toEqual([]);
}, 60_000);

test("search uses the title index and combines with filters", async () => {
	const { owner, projectSlug } = await fixture();
	const hits = await listAll(owner, projectSlug, { search: "checkout" });
	expect(hits).toHaveLength(Math.ceil(ITEMS / 10));
	expect(hits.every((row) => row.title.startsWith("Checkout crash"))).toBe(true);
	const narrowed = await listAll(owner, projectSlug, { search: "checkout", status: "Completed" });
	expect(narrowed.every((row) => row.status === "Completed" && row.title.startsWith("Checkout"))).toBe(true);
	expect(narrowed.length).toBeGreaterThan(0);
	expect(narrowed.length).toBeLessThan(hits.length);
}, 60_000);

test("needs-attention keeps open items that are high-ranked, unassigned or stale", async () => {
	const { t, owner, projectSlug } = await fixture();
	const now = from + 30 * day;
	const rows = await listAll(owner, projectSlug, { attention: { now } });
	const all = await t.run((ctx) => ctx.db.query("feedback").collect());
	// Critical is the lane, so High/Medium/Critical qualify; every open item
	// here is also stale at `now`, so the queue is the whole open backlog.
	expect(rows).toHaveLength(all.filter((row) => row.status !== "Completed").length);
	expect(rows.every((row) => row.status !== "Completed")).toBe(true);
}, 60_000);

test("deep links resolve outside the loaded page and stale ids return null", async () => {
	const { t, owner, projectSlug, organizationId } = await fixture();
	const [oldest] = await t.run((ctx) => ctx.db.query("feedback").withIndex("by_projectId_receivedAt").order("asc").take(1));
	expect(await owner.query(api.feedback.queries.find, { projectSlug, feedbackId: oldest._id })).toMatchObject({ _id: oldest._id });
	expect(await owner.query(api.feedback.queries.find, { projectSlug, feedbackId: "not-an-id" })).toBeNull();
	const other = await t.run(async (ctx) => {
		const project = await ctx.db.insert("projects", { organizationId, name: "Other", slug: "other", description: "", status: "Active", inboxEnabled: true, defaultPriority: "Low", criticalAlerts: false, weeklyDigest: false });
		const { _id, _creationTime, ...fields } = oldest;
		void _id; void _creationTime;
		return insertFeedbackRow(ctx, { ...fields, projectId: project });
	});
	expect(await owner.query(api.feedback.queries.find, { projectSlug, feedbackId: other })).toBeNull();
	await expect(t.query(api.feedback.queries.list, { projectSlug, filters: {}, paginationOpts: { numItems: 5, cursor: null } })).rejects.toThrow(/sign in/i);
}, 60_000);

test("workspace assignees expose only a minimal public profile", async () => {
	const { owner, projectSlug } = await fixture();
	const { assignees } = await owner.query(api.feedback.queries.workspace, { projectSlug });
	expect(assignees.length).toBe(2);
	for (const assignee of assignees) expect(Object.keys(assignee).sort()).toEqual(["_id", "image", "name"]);
	expect(JSON.stringify(assignees)).not.toMatch(/@example\.com|555-0100|emailVerificationTime/);
}, 60_000);

test("aggregates follow inserts, updates, final statuses, taxonomy edits and member removal", async () => {
	const { owner, member, projectSlug, memberId } = await fixture();
	const summary = async () => (await owner.query(api.feedback.queries.workspace, { projectSlug })).summary;
	const overview = () => owner.query(api.dashboard.overview.get, { projectSlug, from, to });
	const team = async () => (await owner.query(api.team.queries.get, { projectSlug })).members.find((row) => row.id === memberId)!;
	const before = await summary();
	const beforeOverview = await overview();

	// Team logging goes through insertFeedback and lands in every aggregate.
	const { feedbackId } = await owner.mutation(api.feedback.mutations.create, {
		projectSlug, title: "Logged by phone", description: "Customer called about invoices.", category: "Bug", priority: "Critical",
	});
	expect(await summary()).toMatchObject({ total: before.total + 1, open: before.open + 1, unassigned: before.unassigned + 1, critical: before.critical + 1 });

	// Assigning moves workload; completing closes it and counts the completion.
	await owner.mutation(api.feedback.mutations.update, { projectSlug, feedbackId, changes: { assigneeId: memberId } });
	const assigned = await team();
	expect((await summary()).unassigned).toBe(before.unassigned);
	await owner.mutation(api.feedback.mutations.update, { projectSlug, feedbackId, changes: { status: "Completed" } });
	expect(await summary()).toMatchObject({ open: before.open, critical: before.critical });
	expect((await team()).openAssigned).toBe(assigned.openAssigned! - 1);
	const memberOverview = await member.query(api.dashboard.overview.get, { projectSlug, from, to: Date.now() + day });
	expect(memberOverview.mine.completedInRange).toBeGreaterThanOrEqual(1);
	expect((await overview()).statuses.find((row) => row.status === "Completed")!.count)
		.toBe(beforeOverview.statuses.find((row) => row.status === "Completed")!.count + 1);

	// Taxonomy edits re-derive open/closed at read time without rewriting rows.
	await owner.mutation(api.taxonomies.mutations.updateOption, { projectSlug, key: "status", value: "Completed", isFinal: false });
	expect((await summary()).open).toBe(before.total + 1);
	await owner.mutation(api.taxonomies.mutations.updateOption, { projectSlug, key: "status", value: "Completed", isFinal: true });
	expect((await summary()).open).toBe(before.open);

	// Removing a member returns their open work to the unassigned queue.
	const openForMember = (await team()).openAssigned!;
	expect(openForMember).toBeGreaterThan(0);
	await owner.mutation(api.team.mutations.removeMember, { projectSlug, memberId });
	expect((await summary()).unassigned).toBe(before.unassigned + openForMember);
}, 60_000);

test("removing a member with a very large queue finishes in scheduled batches", async () => {
	const { t, owner, projectSlug, projectId, memberId } = await fixture();
	await t.run(async (ctx) => {
		for (let index = 0; index < 130; index++)
			await insertFeedbackRow(ctx, {
				projectId, title: `Owned ${index}`, description: "Owned", category: "Bug", priority: "Low", status: "New",
				assigneeId: memberId, sender: null, receivedAt: from, updatedAt: from,
			});
	});
	await owner.mutation(api.team.mutations.removeMember, { projectSlug, memberId });
	await t.finishAllScheduledFunctions(() => {});
	const open = await t.run(async (ctx) => (await ctx.db.query("feedback")
		.withIndex("by_projectId_assigneeId", (q) => q.eq("projectId", projectId).eq("assigneeId", memberId))
		.collect()).filter((row) => row.status !== "Completed"));
	expect(open).toEqual([]);
	const { summary } = await owner.query(api.feedback.queries.workspace, { projectSlug });
	expect(summary.unassigned).toBe(summary.open);
}, 60_000);

test("backfill rebuilds aggregates for rows written before they existed and is idempotent", async () => {
	const { t, owner, projectSlug, projectId } = await fixture();
	const before = (await owner.query(api.feedback.queries.workspace, { projectSlug })).summary;
	// Legacy rows that bypassed the store (pre-aggregate production data).
	await t.run(async (ctx) => {
		for (let index = 0; index < 30; index++)
			await ctx.db.insert("feedback", {
				projectId, title: `Legacy ${index}`, description: "Legacy", category: "Bug", priority: "Low", status: "New",
				assigneeId: null, sender: null, receivedAt: from, updatedAt: from,
			});
	});
	expect((await owner.query(api.feedback.queries.workspace, { projectSlug })).summary.total).toBe(before.total);
	for (let run = 0; run < 2; run++) {
		await t.mutation(internal.feedback.store.backfillAggregates, {});
		await t.finishAllScheduledFunctions(() => {});
	}
	expect((await owner.query(api.feedback.queries.workspace, { projectSlug })).summary).toMatchObject({
		total: before.total + 30, open: before.open + 30, unassigned: before.unassigned + 30,
	});
}, 60_000);
