/**
 * Membership integrity: invitation links die with their creator's grants,
 * projects never lose their last administrator, member emails stay with
 * team managers, account deletion leaves no sign-in throttling rows, and
 * purged slugs are never handed out again.
 */
import { newConvexTest } from "../test/convex-test";
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { uniqueSlug } from "./lib/slugs";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
	vi.stubEnv("TURNSTILE_SECRET_KEY", "");
	vi.stubEnv("INTAKE_CAPTCHA_DISABLED", "true");
});
afterEach(() => {
	vi.unstubAllEnvs();
});

/** Owner's workspace "Acme" / "Portal" with a manager and a member. */
async function workspace() {
	const t = newConvexTest(modules);
	const [ownerId, managerId, memberId, outsiderId] = await t.run(async (ctx) => [
		await ctx.db.insert("users", { name: "Olive Owner", email: "owner@example.com" }),
		await ctx.db.insert("users", { name: "Max Manager", email: "manager@example.com" }),
		await ctx.db.insert("users", { name: "Mia Member", email: "member@example.com" }),
		await ctx.db.insert("users", { name: "Oscar Outsider", email: "outsider@example.com" }),
	]);
	const owner = t.withIdentity({ subject: ownerId });
	const manager = t.withIdentity({ subject: managerId });
	const member = t.withIdentity({ subject: memberId });
	const outsider = t.withIdentity({ subject: outsiderId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, {
		name: "Acme",
		projectName: "Portal",
	});
	const { roles } = await owner.query(api.projects.settings.roles, { projectSlug });
	const roleId = (name: string) => roles.find((role) => role.name === name)!.id;
	for (const [invitee, role] of [[manager, "manager"], [member, "member"]] as const) {
		const { token } = await owner.action(api.invitations.actions.create, {
			projectSlug,
			roleId: roleId(role),
			expiresInHours: 1,
		});
		await invitee.mutation(api.invitations.mutations.accept, { token });
	}
	const { projectId, organizationId } = await t.run(async (ctx) => {
		const project = (await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", projectSlug))
			.unique())!;
		return { projectId: project._id, organizationId: project.organizationId };
	});
	return {
		t, owner, manager, member, outsider,
		ownerId, managerId, memberId, outsiderId,
		projectSlug, projectId, organizationId, roleId,
	};
}

/** A second Acme project whose only member (an admin) is `adminId`. */
async function soloProject(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	adminId: Id<"users">,
	adminRoleId: Id<"roles">,
	name: string,
) {
	const projectId = await ctx.db.insert("projects", {
		organizationId,
		name,
		slug: name.toLowerCase(),
		description: "Side project.",
		status: "Active",
		inboxEnabled: true,
		defaultPriority: "Medium",
		criticalAlerts: false,
		weeklyDigest: false,
	});
	await ctx.db.insert("projectMembers", {
		projectId,
		userId: adminId,
		roleId: adminRoleId,
		joinedAt: Date.now(),
	});
	return projectId;
}

function pendingLinksBy(t: ReturnType<typeof newConvexTest>, userId: Id<"users">) {
	return t.run((ctx) =>
		ctx.db.query("projectInvitations").withIndex("by_createdBy", (q) => q.eq("createdBy", userId)).collect(),
	);
}

test("a removed administrator cannot use the admin link they created, not even on themselves", async () => {
	const { t, owner, manager, outsider, managerId, projectSlug, projectId, roleId } = await workspace();
	await owner.mutation(api.team.mutations.setMemberRole, {
		projectSlug, memberId: managerId, roleId: roleId("admin"),
	});
	const { token } = await manager.action(api.invitations.actions.create, {
		projectSlug, roleId: roleId("admin"), expiresInHours: 24,
	});
	expect(await pendingLinksBy(t, managerId)).toHaveLength(1);

	await owner.mutation(api.team.mutations.removeMember, { projectSlug, memberId: managerId });
	// Their pending links are gone with them.
	expect(await pendingLinksBy(t, managerId)).toEqual([]);

	// Even a link that survived (e.g. created in a race) no longer works.
	await t.run((ctx) =>
		ctx.db.insert("projectInvitations", {
			projectId, roleId: roleId("admin"), token: "stale-admin-link", createdBy: managerId,
			expiresAt: Date.now() + 60_000,
		}),
	);
	for (const caller of [manager, outsider]) {
		await expect(
			caller.mutation(api.invitations.mutations.accept, { token: "stale-admin-link" }),
		).resolves.toMatchObject({ ok: false, reason: "unavailable" });
	}
	await expect(manager.mutation(api.invitations.mutations.accept, { token })).resolves.toMatchObject({
		ok: false, reason: "invalid",
	});
	const link = await t.run((ctx) =>
		ctx.db.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId).eq("userId", managerId))
			.unique(),
	);
	expect(link).toBeNull();
});

test("demoting an administrator retires the links they can no longer grant", async () => {
	const { t, owner, manager, outsider, managerId, projectSlug, projectId, roleId } = await workspace();
	await owner.mutation(api.team.mutations.setMemberRole, {
		projectSlug, memberId: managerId, roleId: roleId("admin"),
	});
	await manager.action(api.invitations.actions.create, {
		projectSlug, roleId: roleId("admin"), expiresInHours: 24,
	});
	await owner.mutation(api.team.mutations.setMemberRole, {
		projectSlug, memberId: managerId, roleId: roleId("manager"),
	});
	expect(await pendingLinksBy(t, managerId)).toEqual([]);

	// A leftover link of the demoted (no team.manage) creator is refused.
	await t.run((ctx) =>
		ctx.db.insert("projectInvitations", {
			projectId, roleId: roleId("member"), token: "demoted-link", createdBy: managerId,
			expiresAt: Date.now() + 60_000,
		}),
	);
	await expect(
		outsider.mutation(api.invitations.mutations.accept, { token: "demoted-link" }),
	).resolves.toMatchObject({ ok: false, reason: "unavailable" });
});

test("links that exceed the creator's current grants are refused at accept time", async () => {
	const { t, outsider, ownerId, projectId, roleId } = await workspace();
	// A custom role that may manage the team but not the project.
	await t.run(async (ctx) => {
		const keys = ["project.view", "feedback.view", "team.view", "team.manage"] as const;
		const permissionIds = await Promise.all(
			keys.map(async (key) =>
				(await ctx.db.query("permissions").withIndex("by_key", (q) => q.eq("key", key)).unique())!._id,
			),
		);
		const coordinatorRoleId = await ctx.db.insert("roles", { name: "coordinator", permissionIds, projectId });
		const ownerLink = (await ctx.db.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId).eq("userId", ownerId))
			.unique())!;
		await ctx.db.insert("projectInvitations", {
			projectId, roleId: roleId("admin"), token: "too-strong", createdBy: ownerId,
			expiresAt: Date.now() + 60_000,
		});
		// The creator's own access shrinks after the link was made.
		await ctx.db.patch("projectMembers", ownerLink._id, { roleId: coordinatorRoleId });
	});
	await expect(
		outsider.mutation(api.invitations.mutations.accept, { token: "too-strong" }),
	).resolves.toMatchObject({ ok: false, reason: "unavailable" });
});

test("leaving an organization never strands a project without an administrator", async () => {
	const { t, member, memberId, ownerId, organizationId, roleId } = await workspace();
	const sideId = await t.run((ctx) => soloProject(ctx, organizationId, memberId, roleId("admin"), "Side"));
	await expect(member.mutation(api.organizations.members.leave, { organizationId })).rejects.toThrow(
		"You are the only administrator of Side.",
	);
	// Once someone else administers it, leaving works.
	await t.run((ctx) =>
		ctx.db.insert("projectMembers", { projectId: sideId, userId: ownerId, roleId: roleId("admin"), joinedAt: 0 }),
	);
	await member.mutation(api.organizations.members.leave, { organizationId });
	expect(
		await t.run((ctx) => ctx.db.query("projectMembers").withIndex("by_userId", (q) => q.eq("userId", memberId)).collect()),
	).toEqual([]);
});

test("removing a project's only administrator from the organization hands it to the remover", async () => {
	const { t, owner, managerId, ownerId, organizationId, roleId } = await workspace();
	const sideId = await t.run((ctx) => soloProject(ctx, organizationId, managerId, roleId("admin"), "Side"));
	// A pending link the manager created there, and one in a project they left.
	await t.run(async (ctx) => {
		await ctx.db.insert("projectInvitations", {
			projectId: sideId, roleId: roleId("member"), token: "side-link", createdBy: managerId,
			expiresAt: Date.now() + 60_000,
		});
	});
	await owner.mutation(api.organizations.members.removeMember, { organizationId, userId: managerId });
	await t.finishAllScheduledFunctions(() => {});
	const state = await t.run(async (ctx) => ({
		ownerLink: await ctx.db.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", sideId).eq("userId", ownerId))
			.unique(),
		managerLinks: await ctx.db.query("projectMembers").withIndex("by_userId", (q) => q.eq("userId", managerId)).collect(),
	}));
	expect(state.ownerLink?.roleId).toBe(roleId("admin"));
	expect(state.managerLinks).toEqual([]);
	expect(await pendingLinksBy(t, managerId)).toEqual([]);
	await expect(owner.query(api.team.queries.get, { projectSlug: "side" })).resolves.toMatchObject({
		members: [expect.objectContaining({ id: ownerId, role: "admin" })],
	});
});

test("organization removal clears pending links in every project of that organization only", async () => {
	const { t, owner, ownerId, memberId, organizationId, projectId, roleId, outsiderId } = await workspace();
	const otherProject = await t.run(async (ctx) => {
		const otherOrg = await ctx.db.insert("organizations", { name: "Elsewhere", slug: "elsewhere", ownerId: outsiderId });
		const id = await ctx.db.insert("projects", {
			organizationId: otherOrg, name: "Away", slug: "away", description: "", status: "Active",
			inboxEnabled: true, defaultPriority: "Medium", criticalAlerts: false, weeklyDigest: false,
		});
		// Many unrelated pending links ahead of the member's.
		for (let index = 0; index < 250; index++)
			await ctx.db.insert("projectInvitations", {
				projectId, roleId: roleId("member"), token: `owner-${index}`, createdBy: ownerId,
				expiresAt: Date.now() + 1000 + index,
			});
		await ctx.db.insert("projectInvitations", {
			projectId, roleId: roleId("member"), token: "member-late", createdBy: memberId,
			expiresAt: Date.now() + 10 * 60_000,
		});
		await ctx.db.insert("projectInvitations", {
			projectId: id, roleId: roleId("member"), token: "member-elsewhere", createdBy: memberId,
			expiresAt: Date.now() + 60_000,
		});
		return id;
	});
	await owner.mutation(api.organizations.members.removeMember, { organizationId, userId: memberId });
	await t.finishAllScheduledFunctions(() => {});
	const remaining = await pendingLinksBy(t, memberId);
	expect(remaining.map((link) => [link.token, link.projectId])).toEqual([["member-elsewhere", otherProject]]);
});

test("only team managers see member email addresses", async () => {
	const { owner, member, projectSlug } = await workspace();
	const asOwner = await owner.query(api.team.queries.get, { projectSlug });
	expect(asOwner.members.map((row) => row.email).sort()).toEqual([
		"manager@example.com", "member@example.com", "owner@example.com",
	]);
	const asMember = await member.query(api.team.queries.get, { projectSlug });
	expect(asMember.members).toHaveLength(3);
	expect(asMember.members.every((row) => row.email === null)).toBe(true);
});

test("account deletion removes sign-in throttling rows keyed by the account id", async () => {
	const { t, member, memberId } = await workspace();
	const accountId = await t.run(async (ctx) => {
		const id = await ctx.db.insert("authAccounts", {
			userId: memberId, provider: "password", providerAccountId: "member@example.com",
		});
		await ctx.db.insert("authRateLimits", { identifier: id, lastAttemptTime: Date.now(), attemptsLeft: 3 });
		await ctx.db.insert("authRateLimits", {
			identifier: "member@example.com", lastAttemptTime: Date.now(), attemptsLeft: 3,
		});
		await ctx.db.insert("authRateLimits", { identifier: "someone-else", lastAttemptTime: Date.now(), attemptsLeft: 3 });
		return id;
	});
	await t.mutation(internal.users.deletion.performDeletion, { userId: memberId, confirmation: "member@example.com" });
	await t.finishAllScheduledFunctions(() => {});
	const rows = await t.run((ctx) => ctx.db.query("authRateLimits").collect());
	expect(rows.map((row) => row.identifier)).toEqual(["someone-else"]);
	expect(rows.some((row) => row.identifier === accountId)).toBe(false);
});

test("purged project and organization slugs are never reused and stay closed", async () => {
	vi.useFakeTimers();
	onTestFinished(() => void vi.useRealTimers());
	const { t, owner, projectSlug, organizationId } = await workspace();
	const slug = await t.run(async (ctx) => (await ctx.db.get("organizations", organizationId))!.slug);
	await owner.mutation(api.organizations.deletion.remove, { organizationId, confirmName: "Acme" });
	// The purge runs after the 7-day restore window.
	vi.advanceTimersByTime(7 * 86_400_000);
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	expect(await t.run((ctx) => ctx.db.get("organizations", organizationId))).toBeNull();
	const retired = await t.run((ctx) => ctx.db.query("retiredSlugs").collect());
	expect(retired.map((row) => [row.kind, row.slug]).sort()).toEqual(
		[["organization", slug], ["project", projectSlug]].sort(),
	);
	// A new workspace with the same names gets fresh slugs.
	const fresh = await t.run(async (ctx) => ({
		project: await uniqueSlug(ctx, "projects", "Portal"),
		organization: await uniqueSlug(ctx, "organizations", "Acme"),
	}));
	expect(fresh.project).not.toBe(projectSlug);
	expect(fresh.project).toMatch(/^portal-/);
	expect(fresh.organization).not.toBe(slug);
	// The old public form link keeps answering "not accepting".
	await expect(t.query(api.intake.public.form, { projectSlug })).resolves.toEqual({ accepting: false });
});

test("notification preferences are deleted with project and organization membership", async () => {
	const { t, owner, member, managerId, memberId, outsiderId, organizationId, projectId, projectSlug } =
		await workspace();
	const prefs = (userId: Id<"users">) =>
		t.run((ctx) =>
			ctx.db.query("notificationPreferences").withIndex("by_userId_projectId", (q) => q.eq("userId", userId)).collect(),
		);
	const seed = (userId: Id<"users">, project: Id<"projects">) =>
		t.run((ctx) =>
			ctx.db.insert("notificationPreferences", {
				userId, projectId: project, criticalAlerts: false, weeklyDigest: false,
				unsubscribeToken: `${userId}-${project}`.padEnd(64, "0").slice(0, 64), updatedAt: 0,
			}),
		);
	const { sideId, awayId } = await t.run(async (ctx) => {
		const sideId = await ctx.db.insert("projects", {
			organizationId, name: "Side", slug: "side", description: "", status: "Active",
			inboxEnabled: true, defaultPriority: "Medium", criticalAlerts: false, weeklyDigest: false,
		});
		const otherOrg = await ctx.db.insert("organizations", { name: "Elsewhere", slug: "elsewhere", ownerId: outsiderId });
		const awayId = await ctx.db.insert("projects", {
			organizationId: otherOrg, name: "Away", slug: "away", description: "", status: "Active",
			inboxEnabled: true, defaultPriority: "Medium", criticalAlerts: false, weeklyDigest: false,
		});
		return { sideId, awayId };
	});

	// Project removal: only that project's row goes.
	await seed(memberId, projectId);
	await seed(memberId, sideId);
	await owner.mutation(api.team.mutations.removeMember, { projectSlug, memberId });
	expect((await prefs(memberId)).map((row) => row.projectId)).toEqual([sideId]);

	// Leaving the organization: rows for its projects go (also ones they had
	// already left), other organizations' rows stay.
	await seed(memberId, awayId);
	await member.mutation(api.organizations.members.leave, { organizationId });
	expect((await prefs(memberId)).map((row) => row.projectId)).toEqual([awayId]);

	// Removal by an organization administrator.
	await seed(managerId, projectId);
	await owner.mutation(api.organizations.members.removeMember, { organizationId, userId: managerId });
	await t.finishAllScheduledFunctions(() => {});
	expect(await prefs(managerId)).toEqual([]);
});
