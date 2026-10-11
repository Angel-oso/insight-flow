import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { capabilities, type Capability } from "../../lib/auth/permissions";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./dashboard/"), load])),
};
const day = 86_400_000;
const from = Date.UTC(2026, 2, 3);
const to = from + 3 * day;
const windowArgs = { projectSlug: "portal", from, to };

async function fixture() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const permissionIds = new Map<Capability, Id<"permissions">>();
		for (const key of capabilities) permissionIds.set(key, await ctx.db.insert("permissions", { key }));
		const memberRole = await ctx.db.insert("roles", {
			name: "member", permissionIds: ["project.view", "feedback.view", "feedback.comment"].map((key) => permissionIds.get(key as Capability)!),
		});
		const managerRole = await ctx.db.insert("roles", {
			name: "manager", permissionIds: ["project.view", "feedback.view", "feedback.assign", "feedback.triage"].map((key) => permissionIds.get(key as Capability)!),
		});
		const hiddenRole = await ctx.db.insert("roles", { name: "No feedback", permissionIds: [permissionIds.get("project.view")!] });
		const member = await ctx.db.insert("users", { name: "Mina Member" });
		const manager = await ctx.db.insert("users", { name: "Max Manager" });
		const hidden = await ctx.db.insert("users", { name: "Hidden Viewer" });
		const outsider = await ctx.db.insert("users", { name: "Outside" });
		const organizationId = await ctx.db.insert("organizations", { name: "Org", slug: "org", ownerId: manager });
		const projectId = await ctx.db.insert("projects", {
			organizationId, name: "Portal", slug: "portal", description: "Test", status: "Active", inboxEnabled: true,
			defaultPriority: "routine", criticalAlerts: false, weeklyDigest: false,
		});
		for (const [userId, roleId] of [[member, memberRole], [manager, managerRole], [hidden, hiddenRole]] as const) {
			await ctx.db.insert("organizationMembers", { organizationId, userId, roleIds: [roleId] });
			await ctx.db.insert("projectMembers", { projectId, userId, roleId, joinedAt: from });
		}
		// A project link without organization membership must never grant access.
		await ctx.db.insert("projectMembers", { projectId, userId: outsider, roleId: managerRole, joinedAt: from });
		for (const [key, items] of [
			["priority", [{ value: "routine", label: "Routine", rank: 1, tone: "muted" }, { value: "high", label: "High", rank: 8, tone: "warning" }, { value: "critical", label: "Critical", rank: 20, tone: "danger" }]],
			["status", [{ value: "open", label: "Open", rank: 1, tone: "info" }, { value: "done", label: "Done", rank: 8, tone: "success", isFinal: true }]],
			["category", [{ value: "idea", label: "Idea", rank: 1, tone: "primary" }]],
		] as const) await ctx.db.insert("taxonomies", { organizationId, key, label: key, items: items.map((item) => ({ ...item })) });
		const add = (title: string, priority: string, receivedAt: number, assigneeId: Id<"users"> | null = member, completedAt?: number) => ctx.db.insert("feedback", {
			projectId, title, priority, receivedAt, assigneeId, completedAt, updatedAt: receivedAt,
			status: completedAt === undefined ? "open" : "done", description: "Feedback", category: "idea", sender: null,
		});
		const low = await add("Old routine", "routine", from - day);
		const highNew = await add("New high", "high", from + day);
		const highOld = await add("Old high", "high", from);
		const critical = await add("Critical", "critical", from + 2 * day);
		const done = await add("Completed in range", "routine", from - 2 * day, member, from + day);
		await add("Previous completion", "routine", from - 3 * day, member, from - day);
		await add("At exclusive end", "routine", to, member, to);
		await add("Before previous window", "routine", from - 3 * day - 1, manager, from - 3 * day - 1);
		await add("Manager work", "critical", from + day, manager);
		const comment = (feedbackId: Id<"feedback">, authorId: Id<"users">, createdAt: number) => ctx.db.insert("comments", { feedbackId, authorId, body: "Note", createdAt });
		await comment(critical, member, from);
		await comment(critical, manager, from + 1);
		await comment(highOld, manager, from);
		await comment(highOld, member, from + 1);
		await comment(highNew, member, from + 2);
		await comment(low, manager, from + 3); // no own comment yet
		await comment(done, manager, from + 4); // final items excluded
		return { member, manager, hidden, outsider, low, highNew, highOld, critical };
	});
	return { t, ids, member: t.withIdentity({ subject: ids.member }), manager: t.withIdentity({ subject: ids.manager }) };
}

test("member receives personal work ordered by taxonomy priority and age, not team workload", async () => {
	const { member, ids } = await fixture();
	const result = await member.query(api.dashboard.overview.get, windowArgs);
	expect(result.viewer.role).toBe("member");
	expect(result.viewer.permissions).not.toContain("feedback.assign");
	expect(result.workload).toBeNull();
	expect(result.mine).toMatchObject({ openCount: 4, urgentCount: 3, completedInRange: 1 });
	expect(result.mine.open.map((item) => item.id)).toEqual([ids.critical, ids.highOld, ids.highNew, ids.low]);
	expect(result.mine.open[0]).toMatchObject({ title: "Critical", priority: "critical", status: "open", receivedAt: from + 2 * day, updatedAt: from + 2 * day });
	expect(result.mine.withNewComments).toEqual([
		{ id: ids.low, title: "Old routine", latestCommentAt: from + 3 },
		{ id: ids.critical, title: "Critical", latestCommentAt: from + 1 },
	]);
});

test("manager workload includes only authorized project members and sorts by open assignments", async () => {
	const { manager } = await fixture();
	const result = await manager.query(api.dashboard.overview.get, windowArgs);
	expect(result.workload).toEqual([
		{ name: "Mina Member", initials: "MM", openAssigned: 4, criticalAssigned: 1 },
		{ name: "Max Manager", initials: "MM", openAssigned: 1, criticalAssigned: 1 },
	]);
	expect(result.mine).toMatchObject({ openCount: 1, urgentCount: 1, completedInRange: 0 });
});

test("windows are half-open, previous period is equal length, and trend buckets cover every day", async () => {
	const { member } = await fixture();
	const result = await member.query(api.dashboard.overview.get, windowArgs);
	expect(result.metrics).toMatchObject({ received: 4, receivedPrevious: 3, completedInRange: 1, completedPrevious: 1 });
	expect(result.trend).toEqual([
		{ dayStart: from, received: 1, resolved: 0 },
		{ dayStart: from + day, received: 2, resolved: 1 },
		{ dayStart: from + 2 * day, received: 1, resolved: 0 },
	]);
});

test.each([
	{ from, to: from }, { from: to, to: from }, { from, to: from + 366 * day },
	{ from: NaN, to }, { from, to: Infinity },
])("invalid date window rejects with ConvexError: %j", async (window) => {
	const { member } = await fixture();
	await expect(member.query(api.dashboard.overview.get, { ...windowArgs, ...window })).rejects.toBeInstanceOf(ConvexError);
});

test("365-day and partial-day windows are valid", async () => {
	const { member } = await fixture();
	expect((await member.query(api.dashboard.overview.get, { ...windowArgs, to: from + 365 * day })).trend).toHaveLength(365);
	expect((await member.query(api.dashboard.overview.get, { ...windowArgs, to: from + day + 1 })).trend).toHaveLength(2);
});

test("anonymous and non-member callers cannot read overview", async () => {
	const { t, ids } = await fixture();
	await expect(t.query(api.dashboard.overview.get, windowArgs)).rejects.toThrow(/sign in/i);
	await expect(t.withIdentity({ subject: ids.outsider }).query(api.dashboard.overview.get, windowArgs)).rejects.toThrow(/denied/i);
});

test("personal lists are capped, and equal-time comments are not newer", async () => {
	const { t, member, ids } = await fixture();
	await t.run(async (ctx) => {
		const item = (await ctx.db.get("feedback", ids.low))!;
		for (let index = 0; index < 9; index++) {
			const feedbackId = await ctx.db.insert("feedback", {
				projectId: item.projectId, title: `Extra ${index}`, description: "Extra", category: "idea", priority: "routine",
				status: "open", assigneeId: ids.member, sender: null, receivedAt: from, updatedAt: from,
			});
			await ctx.db.insert("comments", { feedbackId, authorId: ids.manager, body: "Update", createdAt: from + 10 + index });
		}
		await ctx.db.insert("comments", { feedbackId: ids.highNew, authorId: ids.member, body: "Own", createdAt: from + 100 });
		await ctx.db.insert("comments", { feedbackId: ids.highNew, authorId: ids.manager, body: "Same instant", createdAt: from + 100 });
	});
	const result = await member.query(api.dashboard.overview.get, windowArgs);
	expect(result.mine.openCount).toBe(13);
	expect(result.mine.open).toHaveLength(8);
	expect(result.mine.withNewComments).toHaveLength(5);
	expect(result.mine.withNewComments.map((item) => item.id)).not.toContain(ids.highNew);
});

test("project and organization overviews share one health rule, including a high open backlog", async () => {
	const t = convexTest(schema, modules);
	const ownerId = await t.run((ctx) => ctx.db.insert("users", { name: "Owner" }));
	const owner = t.withIdentity({ subject: ownerId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, {
		name: "Health Org",
		projectName: "Busy",
	});
	const addOpen = (count: number) =>
		t.run(async (ctx) => {
			const project = (await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique())!;
			for (let i = 0; i < count; i += 1) {
				await ctx.db.insert("feedback", {
					projectId: project._id, title: `Item ${i}`, description: "Open item", category: "Bug",
					priority: "Low", status: "New", assigneeId: null, sender: null,
					receivedAt: from, updatedAt: from,
				});
			}
			return project.organizationId;
		});
	const health = async (organizationId: Id<"organizations">) => [
		(await owner.query(api.dashboard.overview.get, { projectSlug, from, to })).health.status,
		(await owner.query(api.organizations.queries.overview, { organizationId, from, to })).admin
			?.health.find((row) => row.slug === projectSlug)?.health,
	];

	// One low-priority open item is backlog, not risk, on both screens.
	const organizationId = await addOpen(1);
	expect(await health(organizationId)).toEqual(["Needs attention", "Needs attention"]);
	// 20 open items without criticals is a clearly high backlog: at risk on both.
	await addOpen(19);
	expect(await health(organizationId)).toEqual(["At risk", "At risk"]);
});
