import { newConvexTest } from "../../test/convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { insertFeedbackRow } from "../feedback/store";
import { PROJECT_MEMBER_LIMIT } from "../feedback/access";
import { get as getTeam } from "./queries";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./team/"), load])),
};

type Fields = Omit<Doc<"feedback">, "_id" | "_creationTime">;
const now = Date.UTC(2026, 5, 1);

function item(projectId: Id<"projects">, index: number, overrides: Partial<Fields> = {}): Fields {
	return {
		projectId,
		title: `Item ${index}`,
		description: "Generated item",
		category: "Bug",
		priority: index % 7 === 0 ? "Critical" : "Low",
		status: index % 4 === 0 ? "Completed" : "New",
		completedAt: index % 4 === 0 ? now : undefined,
		assigneeId: null,
		sender: null,
		receivedAt: now + index,
		updatedAt: now + index,
		...overrides,
	};
}

async function workspace() {
	const t = newConvexTest(modules);
	const ownerId = await t.run((ctx) => ctx.db.insert("users", { name: "Owner", email: "owner@example.com" }));
	const owner = t.withIdentity({ subject: ownerId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, { name: "Scale", projectName: "Big" });
	const project = (await t.run((ctx) =>
		ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique()))!;
	const memberRole = (await t.run((ctx) =>
		ctx.db.query("roles").withIndex("by_name", (q) => q.eq("name", "member")).first()))!._id;
	return { t, ownerId, owner, projectSlug, project, memberRole };
}

/**
 * Runs a query handler with a db wrapper that counts every document it
 * returns, as a stand-in for Convex's per-transaction read accounting.
 */
function countingDb<T extends object>(db: T, counter: { reads: number }): T {
	const count = (value: unknown) => {
		if (Array.isArray(value)) counter.reads += value.length;
		else if (value && typeof value === "object" && "page" in value && Array.isArray(value.page))
			counter.reads += value.page.length;
		else if (value) counter.reads += 1;
		return value;
	};
	const wrap = (target: object): object =>
		new Proxy(target, {
			get(object, property) {
				const member = Reflect.get(object, property, object);
				if (typeof member !== "function") return member;
				return (...args: unknown[]) => {
					const result = member.apply(object, args);
					if (result instanceof Promise) return result.then(count);
					if (result && typeof result === "object") return wrap(result);
					return result;
				};
			},
		});
	return wrap(db) as T;
}

test("the team roster stays well inside read limits with a full 200-person team", async () => {
	const { t, ownerId, owner, projectSlug, project, memberRole } = await workspace();
	const { _id, _creationTime, ...projectFields } = project;
	void _id; void _creationTime;
	const busyIds = await t.run(async (ctx) => {
		const extraProjects: Id<"projects">[] = [];
		for (let i = 0; i < 50; i += 1)
			extraProjects.push(await ctx.db.insert("projects", { ...projectFields, slug: `extra-${i}` }));
		const ids: Id<"users">[] = [];
		for (let i = 1; i < PROJECT_MEMBER_LIMIT; i += 1) {
			const userId = await ctx.db.insert("users", { name: `Member ${i}`, email: `m${i}@example.com` });
			await ctx.db.insert("organizationMembers", { organizationId: project.organizationId, userId, roleIds: [memberRole] });
			await ctx.db.insert("projectMembers", { projectId: project._id, userId, joinedAt: now });
			// A dozen people belong to every project in the organization.
			if (i <= 12)
				for (const projectId of extraProjects)
					await ctx.db.insert("projectMembers", { projectId, userId, joinedAt: now });
			ids.push(userId);
		}
		for (let index = 0; index < 400; index += 1)
			await insertFeedbackRow(ctx, item(project._id, index, { assigneeId: index % 3 === 0 ? null : ids[index % 40] }));
		return ids.slice(0, 12);
	});

	const team = await owner.query(api.team.queries.get, { projectSlug });
	expect(team.members).toHaveLength(PROJECT_MEMBER_LIMIT);
	expect(team.summary.memberCount).toBe(PROJECT_MEMBER_LIMIT);
	expect(team.summary.unassigned).toBeGreaterThan(0);
	expect(team.members.reduce((total, row) => total + (row.criticalAssigned ?? 0), 0)).toBeGreaterThan(0);

	const counter = { reads: 0 };
	await owner.run(async (ctx) => {
		const handler = (getTeam as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;
		await handler({ ...ctx, db: countingDb(ctx.db, counter) }, { projectSlug });
	});
	expect(counter.reads).toBeGreaterThan(PROJECT_MEMBER_LIMIT);
	expect(counter.reads).toBeLessThan(8000);

	// Project scope loads per row and counts only this organization's live projects.
	expect(await owner.query(api.team.queries.memberProjectCount, { projectSlug, memberId: busyIds[0] }))
		.toEqual({ count: 51, capped: false });
	const extra = await t.run((ctx) => ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", "extra-0")).unique());
	await t.run((ctx) => ctx.db.patch("projects", extra!._id, { deletionRequestedAt: now }));
	expect(await owner.query(api.team.queries.memberProjectCount, { projectSlug, memberId: busyIds[0] }))
		.toEqual({ count: 50, capped: false });
	expect(await owner.query(api.team.queries.memberProjectCount, { projectSlug, memberId: ownerId }))
		.toEqual({ count: 1, capped: false });
	// Someone outside this project's team is not probed.
	const outsider = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));
	expect(await owner.query(api.team.queries.memberProjectCount, { projectSlug, memberId: outsider })).toBeNull();
	// Members (no feedback.assign) never get per-person scope.
	const member = t.withIdentity({ subject: busyIds[1] });
	expect(await member.query(api.team.queries.memberProjectCount, { projectSlug, memberId: busyIds[0] })).toBeNull();
}, 120_000);

test("removing a member releases open work in removed statuses, in continued batches", async () => {
	const { t, owner, projectSlug, project, memberRole } = await workspace();
	const memberId = await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", { name: "Leaving", email: "leaving@example.com" });
		await ctx.db.insert("organizationMembers", { organizationId: project.organizationId, userId, roleIds: [memberRole] });
		await ctx.db.insert("projectMembers", { projectId: project._id, userId, joinedAt: now });
		for (let index = 0; index < 230; index += 1)
			await insertFeedbackRow(ctx, item(project._id, index, {
				assigneeId: userId,
				// A status no longer in the taxonomy still counts as open work.
				...(index % 10 === 1 ? { status: "Legacy review" } : {}),
			}));
		return userId;
	});
	await owner.mutation(api.team.mutations.removeMember, { projectSlug, memberId });
	await t.finishAllScheduledFunctions(() => {});

	const rows = await t.run((ctx) =>
		ctx.db.query("feedback").withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", project._id)).collect());
	const stillAssigned = rows.filter((row) => row.assigneeId === memberId);
	expect(stillAssigned.length).toBeGreaterThan(0);
	expect(stillAssigned.every((row) => row.status === "Completed")).toBe(true);
	expect(rows.filter((row) => row.status === "Legacy review").every((row) => row.assigneeId === null)).toBe(true);

	const team = await owner.query(api.team.queries.get, { projectSlug });
	expect(team.summary.unassigned).toBe(rows.filter((row) => row.status !== "Completed").length);
}, 60_000);

test("removing a member never touches another person's queue", async () => {
	const { t, owner, projectSlug, project, memberRole } = await workspace();
	const [leaving, staying] = await t.run(async (ctx) => {
		const ids: Id<"users">[] = [];
		for (const name of ["Leaving", "Staying"]) {
			const userId = await ctx.db.insert("users", { name });
			await ctx.db.insert("organizationMembers", { organizationId: project.organizationId, userId, roleIds: [memberRole] });
			await ctx.db.insert("projectMembers", { projectId: project._id, userId, joinedAt: now });
			ids.push(userId);
		}
		for (let index = 1; index < 6; index += 1)
			await insertFeedbackRow(ctx, item(project._id, index, { assigneeId: ids[index % 2], status: "New", completedAt: undefined }));
		return ids;
	});
	// A plain member cannot remove anyone.
	await expect(t.withIdentity({ subject: staying }).mutation(api.team.mutations.removeMember, {
		projectSlug, memberId: leaving,
	})).rejects.toThrow();
	await owner.mutation(api.team.mutations.removeMember, { projectSlug, memberId: leaving });
	await t.finishAllScheduledFunctions(() => {});
	const rows = await t.run((ctx) => ctx.db.query("feedback").collect());
	expect(rows.filter((row) => row.assigneeId === staying)).toHaveLength(3);
	expect(rows.filter((row) => row.assigneeId === leaving)).toHaveLength(0);
});
