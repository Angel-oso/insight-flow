/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { newConvexTest } from "../../test/convex-test";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./organizations/"), load])),
};

type RoleName = "admin" | "manager" | "member";

/**
 * Owner workspace plus: an organization admin, a "project admin" who is an
 * organization member pinned as admin in the project only, and a member.
 */
async function fixture() {
	const t = newConvexTest(modules);
	const ownerId = await t.run((ctx) => ctx.db.insert("users", { name: "Olivia Owner", email: "owner@example.com" }));
	const owner = t.withIdentity({ subject: ownerId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, { name: "Studio", projectName: "Portal" });
	const ids = await t.run(async (ctx) => {
		const project = (await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique())!;
		const organizationId = project.organizationId;
		const role = async (name: RoleName) =>
			(await ctx.db.query("roles").withIndex("by_projectId_name", (q) => q.eq("projectId", undefined).eq("name", name)).unique())!._id;
		const roles = { admin: await role("admin"), manager: await role("manager"), member: await role("member") };
		const add = async (name: string, orgRole: RoleName, projectRole: RoleName) => {
			const userId = await ctx.db.insert("users", { name, email: `${name.split(" ")[0].toLowerCase()}@example.com` });
			await ctx.db.insert("organizationMembers", { organizationId, userId, roleIds: [roles[orgRole]] });
			await ctx.db.insert("projectMembers", { projectId: project._id, userId, roleId: roles[projectRole], joinedAt: 1 });
			return userId;
		};
		return {
			organizationId,
			projectId: project._id,
			roles,
			orgAdmin: await add("Ada Admin", "admin", "admin"),
			projectAdmin: await add("Pat ProjectAdmin", "member", "admin"),
			member: await add("Max Member", "member", "member"),
		};
	});
	const as = (userId: Id<"users">) => t.withIdentity({ subject: userId });
	return { t, owner, ownerId, projectSlug, ids, as };
}

async function orgRole(t: Awaited<ReturnType<typeof fixture>>["t"], organizationId: Id<"organizations">, userId: Id<"users">) {
	return t.run(async (ctx) => {
		const membership = await ctx.db.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) => q.eq("organizationId", organizationId).eq("userId", userId)).unique();
		return membership ? (await ctx.db.get("roles", membership.roleIds[0]))?.name : null;
	});
}

test("setRole: only organization admins change organization roles", async () => {
	const { t, ids, as } = await fixture();
	const args = { organizationId: ids.organizationId, userId: ids.member, role: "admin" as const };
	await expect(as(ids.projectAdmin).mutation(api.organizations.members.setRole, args)).rejects.toThrow(/Only organization administrators/);
	await expect(as(ids.member).mutation(api.organizations.members.setRole, args)).rejects.toThrow(/Only organization administrators/);
	const outsider = await t.run((ctx) => ctx.db.insert("users", { name: "Eve" }));
	await expect(as(outsider).mutation(api.organizations.members.setRole, args)).rejects.toThrow(/Organization access denied/);
	expect(await orgRole(t, ids.organizationId, ids.member)).toBe("member");
});

test("setRole: promoted members can receive ownership; changes are audited without emails", async () => {
	const { t, owner, ownerId, ids, as } = await fixture();
	await as(ids.orgAdmin).mutation(api.organizations.members.setRole, { organizationId: ids.organizationId, userId: ids.member, role: "admin" });
	expect(await orgRole(t, ids.organizationId, ids.member)).toBe("admin");
	const settings = await owner.query(api.organizations.queries.settings, { organizationId: ids.organizationId });
	expect(settings.eligibleAdmins.map((admin) => admin.id)).toContain(ids.member);
	await owner.mutation(api.organizations.mutations.transferOwnership, { organizationId: ids.organizationId, userId: ids.member });
	expect(await t.run(async (ctx) => (await ctx.db.get("organizations", ids.organizationId))!.ownerId)).toBe(ids.member);

	const log = await owner.query(api.organizations.queries.auditLog, {
		organizationId: ids.organizationId, paginationOpts: { numItems: 10, cursor: null },
	});
	expect(log.page.map((entry) => entry.action).slice(0, 2)).toEqual(["organization.ownership_transferred", "organization.role_changed"]);
	expect(log.page[1]).toMatchObject({ actorName: "Ada Admin", targetName: "Max Member" });
	expect(JSON.stringify(log)).not.toMatch(/@example\.com/);
	void ownerId;
});

test("setRole: the owner stays admin and the organization keeps one admin", async () => {
	const { t, ownerId, ids, as } = await fixture();
	const base = { organizationId: ids.organizationId };
	await expect(as(ids.orgAdmin).mutation(api.organizations.members.setRole, { ...base, userId: ownerId, role: "member" }))
		.rejects.toThrow(/owner must stay an administrator/);
	await expect(as(ids.orgAdmin).mutation(api.organizations.members.setRole, { ...base, userId: ids.projectAdmin, role: "manager" }))
		.resolves.toBeNull();
	// Legacy data: the owner lost the admin role, so Ada is the only admin left.
	await t.run(async (ctx) => {
		const membership = (await ctx.db.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) => q.eq("organizationId", ids.organizationId).eq("userId", ownerId)).unique())!;
		await ctx.db.patch("organizationMembers", membership._id, { roleIds: [ids.roles.manager] });
	});
	await expect(as(ids.orgAdmin).mutation(api.organizations.members.setRole, { ...base, userId: ids.orgAdmin, role: "member" }))
		.rejects.toThrow(/at least one administrator/);
	// Not a member of this organization.
	const stranger = await t.run((ctx) => ctx.db.insert("users", { name: "Stranger" }));
	await expect(as(ids.orgAdmin).mutation(api.organizations.members.setRole, { ...base, userId: stranger, role: "admin" }))
		.rejects.toThrow(/not an organization member/);
});

test("project-only admins cannot demote or remove the owner or organization admins", async () => {
	const { ownerId, projectSlug, ids, as } = await fixture();
	const projectAdmin = as(ids.projectAdmin);
	for (const memberId of [ownerId, ids.orgAdmin]) {
		await expect(projectAdmin.mutation(api.team.mutations.setMemberRole, { projectSlug, memberId, roleId: ids.roles.member }))
			.rejects.toThrow(/Only organization administrators/);
		await expect(projectAdmin.mutation(api.team.mutations.removeMember, { projectSlug, memberId }))
			.rejects.toThrow(/Only organization administrators/);
	}
	// Ordinary members remain theirs to manage.
	await projectAdmin.mutation(api.team.mutations.setMemberRole, { projectSlug, memberId: ids.member, roleId: ids.roles.manager });
});

test("organization admins manage project admins, and can rejoin a project they were removed from", async () => {
	const { t, ownerId, projectSlug, ids, as } = await fixture();
	const orgAdmin = as(ids.orgAdmin);
	await orgAdmin.mutation(api.team.mutations.setMemberRole, { projectSlug, memberId: ids.projectAdmin, roleId: ids.roles.member });
	await orgAdmin.mutation(api.team.mutations.removeMember, { projectSlug, memberId: ids.projectAdmin });
	// Organization admins may act on each other inside a project.
	await as(ownerId).mutation(api.team.mutations.removeMember, { projectSlug, memberId: ids.orgAdmin });
	await expect(orgAdmin.query(api.projects.settings.get, { projectSlug })).rejects.toThrow();
	await expect(as(ids.member).mutation(api.organizations.members.joinProject, { organizationId: ids.organizationId, projectSlug }))
		.rejects.toThrow(/Only organization administrators/);
	await expect(orgAdmin.mutation(api.organizations.members.joinProject, { organizationId: ids.organizationId, projectSlug }))
		.resolves.toEqual({ projectSlug });
	expect((await orgAdmin.query(api.projects.settings.access, { projectSlug }))?.role).toBe("admin");
	const actions = await t.run(async (ctx) => (await ctx.db.query("auditLogs")
		.withIndex("by_organizationId_at", (q) => q.eq("organizationId", ids.organizationId)).collect()).map((row) => row.action));
	expect(actions).toEqual(expect.arrayContaining(["project.member_role_changed", "project.member_removed", "project.admin_joined"]));
});

test("organizations and projects being deleted do not count against creation limits", async () => {
	const { t, owner, ownerId, ids } = await fixture();
	await t.run(async (ctx) => {
		// 1 live owned + 8 more live + 3 being deleted = 9 live (limit 10).
		for (let i = 0; i < 11; i += 1) {
			const organizationId = await ctx.db.insert("organizations", {
				name: `Org ${i}`, slug: `org-${i}`, ownerId, ...(i < 3 ? { deletionRequestedAt: 1 } : {}),
			});
			await ctx.db.insert("organizationMembers", { organizationId, userId: ownerId, roleIds: [] });
		}
		// 1 live project + 48 live + 5 being deleted.
		const project = { organizationId: ids.organizationId, description: "", status: "Active" as const, inboxEnabled: false, defaultPriority: "Medium", criticalAlerts: false, weeklyDigest: false };
		for (let i = 0; i < 48; i += 1) await ctx.db.insert("projects", { ...project, name: `Live ${i}`, slug: `live-${i}` });
		for (let i = 0; i < 5; i += 1) await ctx.db.insert("projects", { ...project, name: `Gone ${i}`, slug: `gone-${i}`, status: "Archived", deletionRequestedAt: 1 });
	});
	await owner.mutation(api.setup.mutations.createWorkspace, { name: "Tenth", projectName: "Tenth" });
	await expect(owner.mutation(api.setup.mutations.createWorkspace, { name: "Eleventh", projectName: "Eleventh" }))
		.rejects.toThrow(/up to 10 workspaces/);

	// The name of a project being deleted is free again.
	const created = await owner.mutation(api.projects.mutations.create, { organizationId: ids.organizationId, name: "Gone 0", description: "" });
	await expect(owner.mutation(api.projects.mutations.create, { organizationId: ids.organizationId, name: "One too many", description: "" }))
		.rejects.toThrow(/up to 50 projects/);
	// New projects start with the public form closed.
	const project = await t.run((ctx) => ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", created.slug)).unique());
	expect(project?.inboxEnabled).toBe(false);
});

test("custom roles are capped per project and deleteRole ignores old invitation links", async () => {
	const { t, owner, ownerId, projectSlug, ids } = await fixture();
	const createRole = (name: string) => owner.mutation(api.projects.settings.createRole, { projectSlug, name, permissionKeys: [] });
	await t.run(async (ctx) => {
		const member = (await ctx.db.get("roles", ids.roles.member))!;
		for (let i = 0; i < 29; i += 1) await ctx.db.insert("roles", { name: `Seeded ${i}`, permissionIds: member.permissionIds, projectId: ids.projectId });
	});
	const reviewer = await createRole("Reviewer");
	await expect(createRole("One more")).rejects.toThrow(/up to 30 custom roles/);
	const listed = await owner.query(api.projects.settings.roles, { projectSlug });
	expect(listed.roles).toHaveLength(33);
	expect(listed.customRoleLimit).toBe(30);

	const now = Date.now();
	const pending = await t.run(async (ctx) => {
		// Plenty of used and expired links (kept 30 days) must not block deletion.
		for (let i = 0; i < 150; i += 1)
			await ctx.db.insert("projectInvitations", { projectId: ids.projectId, roleId: reviewer.id, token: `old-${i}`, createdBy: ownerId, expiresAt: now - 1000, acceptedAt: now - 2000 });
		for (let i = 0; i < 20; i += 1)
			await ctx.db.insert("projectInvitations", { projectId: ids.projectId, roleId: reviewer.id, token: `expired-${i}`, createdBy: ownerId, expiresAt: now - 1000 });
		await ctx.db.patch("projectMembers", (await ctx.db.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", ids.projectId).eq("userId", ids.member)).unique())!._id, { roleId: reviewer.id });
		return ctx.db.insert("projectInvitations", { projectId: ids.projectId, roleId: reviewer.id, token: "open", createdBy: ownerId, expiresAt: now + 3_600_000 });
	});
	await owner.mutation(api.projects.settings.deleteRole, { projectSlug, roleId: reviewer.id });
	await t.run(async (ctx) => {
		expect((await ctx.db.get("projectInvitations", pending))?.roleId).toBe(ids.roles.member);
		const link = await ctx.db.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", ids.projectId).eq("userId", ids.member)).unique();
		expect(link?.roleId).toBe(ids.roles.member);
	});
	await createRole("Fits again");
	const actions = await t.run(async (ctx) => (await ctx.db.query("auditLogs")
		.withIndex("by_organizationId_at", (q) => q.eq("organizationId", ids.organizationId)).collect()).map((row) => row.action));
	expect(actions.filter((action) => action === "project.role_created")).toHaveLength(2);
	expect(actions).toContain("project.role_deleted");
});

test("the audit log is for organization administrators only", async () => {
	const { t, owner, ids, as } = await fixture();
	await owner.mutation(api.organizations.mutations.rename, { organizationId: ids.organizationId, name: "Studio Two" });
	const args = { organizationId: ids.organizationId, paginationOpts: { numItems: 5, cursor: null } };
	await expect(as(ids.member).query(api.organizations.queries.auditLog, args)).rejects.toThrow(/Only organization administrators/);
	await expect(as(ids.projectAdmin).query(api.organizations.queries.auditLog, args)).rejects.toThrow(/Only organization administrators/);
	await expect(t.query(api.organizations.queries.auditLog, args)).rejects.toThrow();
	const log = await as(ids.orgAdmin).query(api.organizations.queries.auditLog, args);
	expect(log.page[0]).toMatchObject({ action: "organization.renamed", actorName: "Olivia Owner", targetName: null });
	expect(log.page.map((entry) => entry.action)).toContain("project.created");
});
