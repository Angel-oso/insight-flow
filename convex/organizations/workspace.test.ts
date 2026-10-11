import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./organizations/"), load])),
};
const day = 86_400_000;
const from = Date.UTC(2026, 3, 1);
const to = from + 7 * day;

async function fixture() {
	const t = convexTest(schema, modules);
	const ownerId = await t.run((ctx) => ctx.db.insert("users", { name: "Owner" }));
	const owner = t.withIdentity({ subject: ownerId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, { name: "Studio", projectName: "Portal" });
	const ids = await t.run(async (ctx) => {
		const project = (await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique())!;
		const organizationId = project.organizationId;
		const roles = await ctx.db.query("roles").take(10);
		const adminRole = roles.find((r) => r.name === "admin")!._id;
		const memberRole = roles.find((r) => r.name === "member")!._id;
		const managerRole = roles.find((r) => r.name === "manager")!._id;
		const addUser = async (name: string, roleId?: Id<"roles">) => {
			const userId = await ctx.db.insert("users", { name, organizationId, roleIds: [adminRole] }); // legacy grants must be ignored
			if (roleId) await ctx.db.insert("organizationMembers", { organizationId, userId, roleIds: [roleId] });
			return userId;
		};
		const admin = await addUser("Another admin", adminRole);
		const member = await addUser("Member", memberRole);
		const manager = await addUser("Manager", managerRole);
		const outsider = await addUser("Outsider");
		await ctx.db.insert("projectMembers", { projectId: project._id, userId: member, joinedAt: from });
		await ctx.db.insert("projectMembers", { projectId: project._id, userId: outsider, roleId: adminRole, joinedAt: from });
		const otherProject = await ctx.db.insert("projects", { organizationId, name: "Backlog", slug: "backlog", description: "Private", status: "Active", inboxEnabled: true, defaultPriority: "Medium", criticalAlerts: false, weeklyDigest: false });
		const emptyProject = await ctx.db.insert("projects", { organizationId, name: "Empty", slug: "empty", description: "Empty", status: "Paused", inboxEnabled: true, defaultPriority: "Medium", criticalAlerts: false, weeklyDigest: false });
		const add = (projectId: Id<"projects">, priority: string, receivedAt: number, status = "New", completedAt?: number) => ctx.db.insert("feedback", { projectId, title: "Item", description: "Item", priority, receivedAt, updatedAt: receivedAt, status, completedAt, assigneeId: null, sender: null, category: "Bug" });
		await add(project._id, "Critical", from);
		await add(project._id, "Low", from - day, "Completed", from + day);
		await add(project._id, "Low", from - 2 * day, "Discarded", from + day);
		await add(project._id, "Low", from - 3 * day, "Completed", from - day);
		await add(project._id, "Low", to);
		for (let i = 0; i < 20; i++) await add(otherProject, "Low", from + day);
		await ctx.db.insert("activities", { projectId: otherProject, actorId: manager, type: "updated", message: "Updated backlog", createdAt: to + day });
		return { organizationId, projectId: project._id, otherProject, emptyProject, admin, member, manager, outsider, adminRole };
	});
	return { t, owner, ownerId, ids, args: { organizationId: ids.organizationId, from, to } };
}

test("onboarding separates organization and project and records creation with both memberships", async () => {
	const { t, ownerId, ids } = await fixture();
	await t.run(async (ctx) => {
		expect(await ctx.db.get("organizations", ids.organizationId)).toMatchObject({ name: "Studio", slug: "studio", ownerId });
		expect(await ctx.db.get("projects", ids.projectId)).toMatchObject({ name: "Portal", slug: "portal" });
		expect(await ctx.db.query("organizationMembers").withIndex("by_organizationId_userId", (q) => q.eq("organizationId", ids.organizationId).eq("userId", ownerId)).unique()).not.toBeNull();
		expect(await ctx.db.query("projectMembers").withIndex("by_projectId_userId", (q) => q.eq("projectId", ids.projectId).eq("userId", ownerId)).unique()).not.toBeNull();
		expect(await ctx.db.query("activities").withIndex("by_projectId_createdAt", (q) => q.eq("projectId", ids.projectId)).take(5)).toEqual([expect.objectContaining({ type: "project_created", actorId: ownerId, message: "Created project Portal" })]);
	});
});

test("admin aggregates all projects, uses top taxonomy priority, final-status resolution and ranked health", async () => {
	const { owner, args } = await fixture();
	const result = await owner.query(api.organizations.queries.overview, args);
	expect(result.projects.map((p) => p.slug)).toEqual(["portal"]);
	expect(result.admin?.metrics).toEqual({ received: 21, receivedPrevious: 3, open: 22, critical: 1, completedInRange: 2, completedPrevious: 1, total: 25 });
	expect(result.admin?.health.map((p) => [p.slug, p.open, p.health])).toEqual([["backlog", 20, "At risk"], ["portal", 2, "At risk"], ["empty", 0, "Healthy"]]);
	expect(result.admin?.health.find((p) => p.slug === "portal")).toMatchObject({ received: 1, resolutionRate: 0.6 });
	expect(result.admin?.activities).toEqual(expect.arrayContaining([expect.objectContaining({ type: "project_created", actor: "Owner", projectName: "Portal" }), expect.objectContaining({ message: "Updated backlog", actor: "Manager", projectName: "Backlog" })]));
	expect((await owner.query(api.dashboard.overview.get, { projectSlug: "portal", from, to })).activities).toEqual(expect.arrayContaining([expect.objectContaining({ action: "Created project Portal" })]));
});

test("member sees only linked projects and never admin data; legacy access and anonymous access rejected", async () => {
	const { t, ids, args } = await fixture();
	const member = t.withIdentity({ subject: ids.member });
	expect(await member.query(api.organizations.queries.overview, args)).toMatchObject({ admin: null, projects: [{ slug: "portal", open: 2, critical: 1 }] });
	expect(await member.query(api.organizations.queries.mine, {})).toEqual([{ id: ids.organizationId, name: "Studio", slug: "studio", isAdmin: false }]);
	await expect(t.withIdentity({ subject: ids.outsider }).query(api.organizations.queries.overview, args)).rejects.toThrow(/access/i);
	expect(await t.withIdentity({ subject: ids.outsider }).query(api.organizations.queries.mine, {})).toEqual([]);
	await expect(t.query(api.organizations.queries.overview, args)).rejects.toThrow(/sign in/i);
});

test.each([{ from, to: from }, { from: to, to: from }, { from, to: from + 366 * day }, { from: NaN, to }, { from, to: Infinity }])("rejects invalid window %j", async (window) => {
	const { owner, args } = await fixture();
	await expect(owner.query(api.organizations.queries.overview, { ...args, ...window })).rejects.toThrow(/date window/i);
});

test("valid windows, noncritical backlog attention, bounded projects and feedback", async () => {
	const { t, owner, ids, args } = await fixture();
	expect((await owner.query(api.organizations.queries.overview, { ...args, to: from + 365 * day })).admin).not.toBeNull();
	await t.run(async (ctx) => {
		const feedback = await ctx.db.query("feedback").withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", ids.projectId)).take(10);
		await ctx.db.patch("feedback", feedback.find((f) => f.priority === "Critical")!._id, { priority: "High" });
	});
	expect((await owner.query(api.organizations.queries.overview, args)).admin?.health.find((p) => p.slug === "portal")).toMatchObject({ critical: 0, health: "Needs attention" });
	await t.run(async (ctx) => {
		for (let i = 0; i < 48; i++) await ctx.db.insert("projects", { organizationId: ids.organizationId, name: `Extra ${i}`, slug: `extra-${i}`, description: "Extra", status: "Active", inboxEnabled: true, defaultPriority: "Medium", criticalAlerts: false, weeklyDigest: false });
	});
	await expect(owner.query(api.organizations.queries.overview, args)).rejects.toThrow(/50 projects/i);
});

test("activity is bounded to latest 15 and project links honor pinned roles", async () => {
	const { t, owner, ids, args } = await fixture();
	await t.run(async (ctx) => {
		for (let i = 0; i < 20; i++) await ctx.db.insert("activities", { projectId: ids.otherProject, actorId: null, type: "updated", message: `Event ${i}`, createdAt: Date.now() + i + day });
		const projectView = (await ctx.db.query("permissions").withIndex("by_key", (q) => q.eq("key", "project.view")).unique())!;
		const roleId = await ctx.db.insert("roles", { name: "No feedback", permissionIds: [projectView._id] });
		await ctx.db.insert("projectMembers", { projectId: ids.otherProject, userId: ids.member, roleId, joinedAt: from });
	});
	const activities = (await owner.query(api.organizations.queries.overview, args)).admin!.activities;
	expect(activities).toHaveLength(15);
	expect(activities[0]).toMatchObject({ actor: "System", message: "Event 19", feedbackId: null });
	expect(activities[14].message).toBe("Event 5");
	expect((await t.withIdentity({ subject: ids.member }).query(api.organizations.queries.overview, args)).projects.map((p) => p.slug)).toEqual(["portal"]);
});

test("feedback cap is explicit for admins, while members never read unlinked project feedback", async () => {
	const { t, owner, ids, args } = await fixture();
	await t.run(async (ctx) => {
		for (let i = 0; i < 181; i++) await ctx.db.insert("feedback", { projectId: ids.otherProject, title: "Overflow", description: "Overflow", category: "Bug", priority: "Low", status: "New", assigneeId: null, sender: null, receivedAt: from, updatedAt: from });
	});
	await expect(owner.query(api.organizations.queries.overview, args)).rejects.toThrow(/200 feedback items/i);
	expect((await t.withIdentity({ subject: ids.member }).query(api.organizations.queries.overview, args)).admin).toBeNull();
});

test("onboarding independently enforces unique organization and project slugs without partial writes", async () => {
	const { t, owner } = await fixture();
	for (const args of [{ name: "Studio", projectName: "Different" }, { name: "Different", projectName: "Portal" }]) {
		await expect(owner.mutation(api.setup.mutations.createWorkspace, args)).rejects.toThrow(/already in use/i);
	}
	expect(await t.run((ctx) => ctx.db.query("organizations").take(10))).toHaveLength(1);
});

test("rename and settings require organization administration; only owner can transfer to eligible admin", async () => {
	const { t, owner, ownerId, ids } = await fixture();
	const admin = t.withIdentity({ subject: ids.admin });
	const manager = t.withIdentity({ subject: ids.manager });
	const before = await t.run((ctx) => ctx.db.get("organizations", ids.organizationId));
	await expect(manager.mutation(api.organizations.mutations.rename, { organizationId: ids.organizationId, name: "Rejected" })).rejects.toThrow(/administrator/i);
	await expect(manager.query(api.organizations.queries.settings, { organizationId: ids.organizationId })).rejects.toThrow(/administrator/i);
	for (const userId of [ids.member, ids.manager, ids.outsider]) await expect(owner.mutation(api.organizations.mutations.transferOwnership, { organizationId: ids.organizationId, userId })).rejects.toThrow(/administrator/i);
	await expect(admin.mutation(api.organizations.mutations.transferOwnership, { organizationId: ids.organizationId, userId: ids.admin })).rejects.toThrow(/owner/i);
	expect(await t.run((ctx) => ctx.db.get("organizations", ids.organizationId))).toEqual(before);
	for (const name of [" ", "a".repeat(81)]) await expect(owner.mutation(api.organizations.mutations.rename, { organizationId: ids.organizationId, name })).rejects.toThrow(/1 and 80/i);
	await admin.mutation(api.organizations.mutations.rename, { organizationId: ids.organizationId, name: " New Studio " });
	expect(await owner.query(api.organizations.queries.settings, { organizationId: ids.organizationId })).toMatchObject({ name: "New Studio", ownerName: "Owner", isOwner: true, eligibleAdmins: expect.arrayContaining([{ id: ids.admin, name: "Another admin" }, { id: ownerId, name: "Owner" }]) });
	await owner.mutation(api.organizations.mutations.transferOwnership, { organizationId: ids.organizationId, userId: ids.admin });
	expect(await admin.query(api.organizations.queries.settings, { organizationId: ids.organizationId })).toMatchObject({ ownerName: "Another admin", isOwner: true });
	await expect(owner.mutation(api.organizations.mutations.transferOwnership, { organizationId: ids.organizationId, userId: ownerId })).rejects.toThrow(/owner/i);
});

test("creating a project by organization requires org manage, links caller and logs creation; switcher remains supported", async () => {
	const { t, owner, ids } = await fixture();
	const args = { organizationId: ids.organizationId, name: "New Product", description: "Description" };
	await expect(t.withIdentity({ subject: ids.manager }).mutation(api.projects.mutations.create, args)).rejects.toThrow(/cannot create/i);
	await expect(t.withIdentity({ subject: ids.outsider }).mutation(api.projects.mutations.create, args)).rejects.toThrow(/cannot create/i);
	await owner.mutation(api.projects.mutations.create, args);
	const projects = await owner.query(api.projects.queries.list, {});
	expect(projects.map((p) => p.slug)).toContain("new-product");
	await owner.mutation(api.projects.mutations.create, { currentProjectSlug: "portal", name: "Switcher project", description: "" });
	expect((await owner.query(api.organizations.queries.overview, { organizationId: ids.organizationId, from, to })).admin?.activities).toEqual(expect.arrayContaining([expect.objectContaining({ type: "project_created", message: "Created project New Product" })]));
});

test("organization selection follows explicit memberships across workspaces", async () => {
	const { owner, ids } = await fixture();
	await owner.mutation(api.setup.mutations.createWorkspace, { name: "Second Studio", projectName: "Second Portal" });
	const mine = await owner.query(api.organizations.queries.mine, {});
	expect(mine.map((org) => org.name)).toEqual(["Studio", "Second Studio"]);
	expect(await owner.query(api.organizations.queries.organizationForProject, { projectSlug: "portal" })).toBe(ids.organizationId);
	const second = mine.find((org) => org.name === "Second Studio")!;
	expect((await owner.query(api.organizations.queries.overview, { organizationId: second.id, from, to })).projects.map((p) => p.slug)).toEqual(["second-portal"]);
});

test("organization-only administrators can enter the shell without a project link", async () => {
	const { t, ids } = await fixture();
	expect(await t.withIdentity({ subject: ids.admin }).query(api.setup.queries.status, {})).toMatchObject({ hasMembership: true });
});

test.each([{ name: "", projectName: "Valid" }, { name: "Valid", projectName: " " }, { name: "Valid", projectName: "a".repeat(81) }])("onboarding validates both names atomically %j", async (args) => {
	const t = convexTest(schema, modules);
	const userId = await t.run((ctx) => ctx.db.insert("users", { name: "New" }));
	await expect(t.withIdentity({ subject: userId }).mutation(api.setup.mutations.createWorkspace, args)).rejects.toThrow(/1 and 80/i);
	expect(await t.run((ctx) => ctx.db.query("organizations").take(1))).toEqual([]);
});
