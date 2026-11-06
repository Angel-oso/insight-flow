/**
 * Data lifecycle: feedback, invitation, membership, project, organization
 * and account deletion. Covers permissions (including foreign admins),
 * cascades down to the aggregates, immediate invisibility of deleted
 * projects, invitation revocation/expiry/rate limits and the cron cleanup.
 */
import { newConvexTest } from "../test/convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
	feedbackByAssignee,
	feedbackByAssigneeCompleted,
	feedbackByCategory,
	feedbackByCompleted,
	feedbackByReceived,
	feedbackByStatus,
} from "./feedback/aggregates";
import { insertFeedbackRow } from "./feedback/store";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;

beforeEach(() => {
	vi.stubEnv("TURNSTILE_SECRET_KEY", "");
	vi.stubEnv("INTAKE_CAPTCHA_DISABLED", "true");
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

type Test = ReturnType<typeof newConvexTest>;

/**
 * Owner's workspace "Acme" with project "Portal", a manager and a member
 * who joined through invitation links, and an outsider who owns "Other".
 */
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
	const other = await outsider.mutation(api.setup.mutations.createWorkspace, {
		name: "Other",
		projectName: "Elsewhere",
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
	const taxonomies = await owner.query(api.taxonomies.queries.list, { projectSlug });
	const fields = {
		category: taxonomies.categories[0].value,
		priority: taxonomies.priorities[0].value,
		status: taxonomies.statuses.find((status) => !status.isFinal)!.value,
	};
	return {
		t, owner, manager, member, outsider,
		ownerId, managerId, memberId, outsiderId,
		projectSlug, projectId, organizationId, otherSlug: other.projectSlug,
		roleId, fields,
	};
}

type Workspace = Awaited<ReturnType<typeof workspace>>;

async function seedFeedback(
	ctx: MutationCtx,
	w: Pick<Workspace, "projectId" | "fields">,
	count: number,
	assigneeId: Id<"users"> | null = null,
) {
	const ids: Id<"feedback">[] = [];
	for (let index = 0; index < count; index++) {
		ids.push(await insertFeedbackRow(ctx, {
			projectId: w.projectId,
			title: `Item ${index}`,
			description: "Seeded",
			...w.fields,
			assigneeId,
			sender: null,
			receivedAt: Date.now() - index * 1000,
			updatedAt: Date.now(),
		}));
	}
	return ids;
}

/** Sum of every feedback aggregate in a project's namespace. */
async function aggregateTotal(t: Test, projectId: Id<"projects">) {
	return t.run(async (ctx) => {
		const counts = await Promise.all([
			feedbackByReceived.count(ctx, { namespace: projectId }),
			feedbackByCompleted.count(ctx, { namespace: projectId }),
			feedbackByStatus.count(ctx, { namespace: projectId }),
			feedbackByCategory.count(ctx, { namespace: projectId }),
			feedbackByAssignee.count(ctx, { namespace: projectId }),
			feedbackByAssigneeCompleted.count(ctx, { namespace: projectId }),
		]);
		return counts.reduce((sum, count) => sum + count, 0);
	});
}

test("feedback deletion needs project.manage and removes the row, discussion and aggregates", async () => {
	const w = await workspace();
	const { t, owner, manager, member, outsider, projectSlug, projectId } = w;
	const ids = await t.run((ctx) => seedFeedback(ctx, w, 3));
	await owner.mutation(api.feedback.mutations.addComment, { projectSlug, feedbackId: ids[0], body: "Spam?" });
	expect(await aggregateTotal(t, projectId)).toBe(18);

	for (const caller of [manager, member])
		await expect(
			caller.mutation(api.feedback.deletion.remove, { projectSlug, feedbackId: ids[0] }),
		).rejects.toThrow("You cannot make this change.");
	await expect(
		outsider.mutation(api.feedback.deletion.remove, { projectSlug, feedbackId: ids[0] }),
	).rejects.toThrow("Project not found.");

	await expect(
		owner.mutation(api.feedback.deletion.remove, { projectSlug, feedbackId: ids[0] }),
	).resolves.toEqual({ deleted: 1 });
	const leftovers = await t.run(async (ctx) => ({
		item: await ctx.db.get("feedback", ids[0]),
		comments: await ctx.db.query("comments")
			.withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", ids[0])).collect(),
		activities: await ctx.db.query("activities")
			.withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", ids[0])).collect(),
	}));
	expect(leftovers).toEqual({ item: null, comments: [], activities: [] });
	// An open detail panel closes instead of erroring.
	await expect(
		owner.query(api.feedback.queries.detail, { projectSlug, feedbackId: ids[0] }),
	).resolves.toBeNull();
	expect((await owner.query(api.feedback.queries.workspace, { projectSlug })).summary.total).toBe(2);

	await expect(
		owner.mutation(api.feedback.deletion.removeMany, {
			projectSlug,
			feedbackIds: Array.from({ length: 51 }, (_, index) => (index === 0 ? ids[1] : ids[2]))
				.concat(await t.run((ctx) => seedFeedback(ctx, w, 50))),
		}),
	).rejects.toThrow("Delete at most 50 items at a time.");
	const all = await t.run(async (ctx) =>
		(await ctx.db.query("feedback")
			.withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", projectId)).collect())
			.map((row) => row._id),
	);
	await owner.mutation(api.feedback.deletion.removeMany, { projectSlug, feedbackIds: all.slice(0, 50) });
	await owner.mutation(api.feedback.deletion.removeMany, { projectSlug, feedbackIds: all.slice(50) });
	await t.finishAllScheduledFunctions(() => {});
	expect((await owner.query(api.feedback.queries.workspace, { projectSlug })).summary.total).toBe(0);
	expect(await aggregateTotal(t, projectId)).toBe(0);
}, 60_000);

test("feedback ids from another project are rejected and archived projects are read-only", async () => {
	const w = await workspace();
	const { t, owner, outsider, projectSlug, otherSlug } = w;
	const [foreignId] = await t.run(async (ctx) => {
		const project = (await ctx.db.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", otherSlug)).unique())!;
		return seedFeedback(ctx, { projectId: project._id, fields: w.fields }, 1);
	});
	await expect(
		owner.mutation(api.feedback.deletion.removeMany, { projectSlug, feedbackIds: [foreignId] }),
	).rejects.toThrow("Feedback not found in this project.");
	await expect(
		outsider.mutation(api.feedback.deletion.remove, { projectSlug: otherSlug, feedbackId: foreignId }),
	).resolves.toEqual({ deleted: 1 });

	const [id] = await t.run((ctx) => seedFeedback(ctx, w, 1));
	await owner.mutation(api.projects.settings.update, { projectSlug, changes: { status: "Archived" } });
	await expect(
		owner.mutation(api.feedback.deletion.remove, { projectSlug, feedbackId: id }),
	).rejects.toThrow("Archived projects cannot be edited.");
});

test("an item with a huge discussion is cleaned up in scheduled batches", async () => {
	const w = await workspace();
	const { t, owner, ownerId, projectSlug } = w;
	const [id] = await t.run(async (ctx) => {
		const ids = await seedFeedback(ctx, w, 1);
		for (let index = 0; index < 1200; index++)
			await ctx.db.insert("comments", { feedbackId: ids[0], authorId: ownerId, body: `Note ${index}`, createdAt: index });
		return ids;
	});
	await owner.mutation(api.feedback.deletion.remove, { projectSlug, feedbackId: id });
	await t.finishAllScheduledFunctions(() => {});
	const comments = await t.run((ctx) =>
		ctx.db.query("comments").withIndex("by_feedbackId_createdAt", (q) => q.eq("feedbackId", id)).take(1),
	);
	expect(comments).toEqual([]);
}, 60_000);

test("pending invitations are listed for team managers and revoked links cannot be accepted", async () => {
	const { t, owner, manager, outsider, projectSlug, roleId } = await workspace();
	const late = t.withIdentity({
		subject: await t.run((ctx) => ctx.db.insert("users", { name: "Late", email: "late@example.com" })),
	});
	const { token } = await owner.action(api.invitations.actions.create, {
		projectSlug, roleId: roleId("member"), expiresInHours: 1,
	});
	const now = Date.now();
	const pending = await owner.query(api.invitations.queries.pending, { projectSlug, now });
	// The two links accepted by the fixture are not pending.
	expect(pending).toHaveLength(1);
	expect(pending[0]).toMatchObject({ role: "member", createdBy: "Olive Owner" });
	expect(pending[0]).not.toHaveProperty("token");
	await expect(
		owner.query(api.invitations.queries.pending, { projectSlug, now: now + 2 * 60 * 60 * 1000 }),
	).resolves.toEqual([]);

	await expect(manager.query(api.invitations.queries.pending, { projectSlug, now })).rejects.toThrow();
	await expect(
		manager.mutation(api.invitations.mutations.revoke, { projectSlug, invitationId: pending[0].id }),
	).rejects.toThrow("You cannot make this change.");
	await expect(
		outsider.mutation(api.invitations.mutations.revoke, { projectSlug, invitationId: pending[0].id }),
	).rejects.toThrow("Project not found.");

	await owner.mutation(api.invitations.mutations.revoke, { projectSlug, invitationId: pending[0].id });
	await expect(late.mutation(api.invitations.mutations.accept, { token })).resolves.toMatchObject({
		ok: false,
		reason: "invalid",
	});
	await expect(late.query(api.invitations.queries.preview, { token })).resolves.toBeNull();
});

test("failed invitation attempts count against the rate limit", async () => {
	const { t, owner, projectSlug, roleId } = await workspace();
	const guesser = t.withIdentity({
		subject: await t.run((ctx) => ctx.db.insert("users", { name: "Guesser" })),
	});
	const { token } = await owner.action(api.invitations.actions.create, {
		projectSlug, roleId: roleId("member"), expiresInHours: 1,
	});
	// Burst capacity is 5; failures commit their token consumption.
	for (let attempt = 0; attempt < 5; attempt++)
		await expect(
			guesser.mutation(api.invitations.mutations.accept, { token: `guess-${attempt}` }),
		).resolves.toMatchObject({ ok: false, reason: "invalid" });
	await expect(guesser.mutation(api.invitations.mutations.accept, { token })).rejects.toThrow(
		"Too many invitation attempts.",
	);
});

test("expired links fail with a result and the daily cleanup purges old links in batches", async () => {
	const { t, owner, ownerId, projectId } = await workspace();
	const now = Date.now();
	await t.run(async (ctx) => {
		const roleId = (await ctx.db.query("roles").withIndex("by_name", (q) => q.eq("name", "member")).unique())!._id;
		for (let index = 0; index < 450; index++)
			await ctx.db.insert("projectInvitations", {
				projectId, roleId, token: `old-${index}`, createdBy: ownerId,
				expiresAt: now - 31 * DAY - index,
				...(index % 2 ? { acceptedAt: now - 32 * DAY } : {}),
			});
		await ctx.db.insert("projectInvitations", {
			projectId, roleId, token: "recently-expired", createdBy: ownerId, expiresAt: now - DAY,
		});
	});
	await expect(owner.mutation(api.invitations.mutations.accept, { token: "recently-expired" })).resolves.toMatchObject({
		ok: false,
		reason: "expired",
	});
	await t.mutation(internal.invitations.mutations.purgeStale, {});
	await t.finishAllScheduledFunctions(() => {});
	const tokens = await t.run(async (ctx) =>
		(await ctx.db.query("projectInvitations").collect()).map((invitation) => invitation.token),
	);
	expect(tokens.filter((token) => token.startsWith("old-"))).toEqual([]);
	expect(tokens).toContain("recently-expired");
	// The two links the fixture accepted expire in an hour: kept too.
	expect(tokens).toHaveLength(3);
}, 60_000);

test("organization admins remove members from every project; owners and self are protected", async () => {
	const w = await workspace();
	const { t, owner, manager, member, outsider, ownerId, managerId, memberId, organizationId, projectId, projectSlug } = w;
	const [assigned] = await t.run((ctx) => seedFeedback(ctx, w, 1, memberId));

	await expect(member.query(api.organizations.members.list, { organizationId })).rejects.toThrow(
		"Only organization administrators",
	);
	await expect(
		manager.mutation(api.organizations.members.removeMember, { organizationId, userId: memberId }),
	).rejects.toThrow("Only organization administrators");
	await expect(
		outsider.mutation(api.organizations.members.removeMember, { organizationId, userId: memberId }),
	).rejects.toThrow("Organization access denied.");
	await expect(
		owner.mutation(api.organizations.members.removeMember, { organizationId, userId: ownerId }),
	).rejects.toThrow("Use Leave organization");

	// A second administrator still cannot remove the owner.
	await t.mutation(internal.setup.admin.assignUserAccess, {
		userId: managerId, organizationId, roleNames: ["admin"], projectIds: [],
	});
	await expect(
		manager.mutation(api.organizations.members.removeMember, { organizationId, userId: ownerId }),
	).rejects.toThrow("The organization owner cannot be removed.");
	await expect(
		t.mutation(internal.setup.admin.assignUserAccess, {
			userId: ownerId, organizationId, roleNames: ["member"], projectIds: [],
		}),
	).rejects.toThrow("The organization owner must keep the admin role.");

	const roster = await owner.query(api.organizations.members.list, { organizationId });
	expect(roster.map((row) => [row.name, row.role, row.isOwner])).toEqual([
		["Olive Owner", "admin", true],
		["Max Manager", "admin", false],
		["Mia Member", "member", false],
	]);

	await owner.mutation(api.organizations.members.removeMember, { organizationId, userId: memberId });
	await t.finishAllScheduledFunctions(() => {});
	const state = await t.run(async (ctx) => ({
		link: await ctx.db.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId).eq("userId", memberId)).unique(),
		membership: await ctx.db.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) => q.eq("organizationId", organizationId).eq("userId", memberId)).unique(),
		item: await ctx.db.get("feedback", assigned),
	}));
	expect(state.link).toBeNull();
	expect(state.membership).toBeNull();
	expect(state.item?.assigneeId).toBeNull();
	await expect(member.query(api.feedback.queries.workspace, { projectSlug })).rejects.toThrow();
});

test("members leave organizations they do not own", async () => {
	const { t, owner, member, memberId, organizationId } = await workspace();
	await expect(owner.mutation(api.organizations.members.leave, { organizationId })).rejects.toThrow(
		"The owner cannot leave.",
	);
	await member.mutation(api.organizations.members.leave, { organizationId });
	await expect(member.query(api.organizations.queries.mine, {})).resolves.toEqual([]);
	await expect(member.query(api.projects.queries.list, {})).resolves.toEqual([]);
	const links = await t.run((ctx) =>
		ctx.db.query("projectMembers").withIndex("by_userId", (q) => q.eq("userId", memberId)).collect(),
	);
	expect(links).toEqual([]);
});

test("project deletion is admin-only, hides the project at once and purges every row", async () => {
	vi.useFakeTimers();
	const w = await workspace();
	const { t, owner, manager, outsider, ownerId, projectSlug, projectId, organizationId } = w;
	const ids = await t.run((ctx) => seedFeedback(ctx, w, 120));
	await t.run(async (ctx) => {
		for (const feedbackId of ids.slice(0, 30))
			await ctx.db.insert("comments", { feedbackId, authorId: ownerId, body: "Note", createdAt: 1 });
	});
	await owner.mutation(api.projects.settings.createRole, {
		projectSlug, name: "Reviewer", permissionKeys: ["feedback.comment"],
	});
	await owner.action(api.invitations.actions.create, {
		projectSlug, roleId: w.roleId("member"), expiresInHours: 1,
	});
	const submission = { projectSlug, title: "Hello there", description: "A public note.", category: w.fields.category };
	// New projects start with the public form closed.
	await owner.mutation(api.projects.settings.update, { projectSlug, changes: { inboxEnabled: true } });
	await t.action(api.intake.public.submit, submission);

	await expect(
		manager.mutation(api.projects.deletion.remove, { projectSlug, confirmName: "Portal" }),
	).rejects.toThrow("Only organization administrators");
	await expect(
		outsider.mutation(api.projects.deletion.remove, { projectSlug, confirmName: "Portal" }),
	).rejects.toThrow("Organization access denied.");
	await expect(
		owner.mutation(api.projects.deletion.remove, { projectSlug, confirmName: "portal" }),
	).rejects.toThrow("Type the project name exactly");

	await owner.mutation(api.projects.deletion.remove, { projectSlug, confirmName: "Portal" });
	// Gone immediately, before any purge step ran.
	await expect(t.query(api.intake.public.form, { projectSlug })).resolves.toEqual({ accepting: false });
	await expect(t.action(api.intake.public.submit, submission)).rejects.toThrow(
		"This feedback link is not accepting submissions.",
	);
	await expect(owner.query(api.feedback.queries.workspace, { projectSlug })).rejects.toThrow("Project not found.");
	await expect(owner.query(api.projects.queries.list, {})).resolves.toEqual([]);
	const overview = await owner.query(api.organizations.queries.overview, {
		organizationId, from: Date.now() - DAY, to: Date.now() + DAY,
	});
	expect(overview.projects).toEqual([]);
	expect(overview.admin?.health).toEqual([]);

	// Nothing is purged inside the 7-day restore window; afterwards everything is.
	vi.advanceTimersByTime(7 * DAY);
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	const remaining = await t.run(async (ctx) => ({
		project: await ctx.db.get("projects", projectId),
		feedback: await ctx.db.query("feedback").withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", projectId)).collect(),
		comments: (await ctx.db.query("comments").collect()).filter((row) => ids.includes(row.feedbackId)),
		activities: await ctx.db.query("activities").withIndex("by_projectId_createdAt", (q) => q.eq("projectId", projectId)).collect(),
		invitations: await ctx.db.query("projectInvitations").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
		members: await ctx.db.query("projectMembers").withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId)).collect(),
		roles: await ctx.db.query("roles").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
	}));
	expect(remaining).toEqual({
		project: null, feedback: [], comments: [], activities: [], invitations: [], members: [], roles: [],
	});
	expect(await aggregateTotal(t, projectId)).toBe(0);
	// The organization itself is untouched.
	await expect(owner.query(api.organizations.queries.mine, {})).resolves.toHaveLength(1);
}, 120_000);

test("organization deletion is owner-only and cascades through projects, members and taxonomies", async () => {
	vi.useFakeTimers();
	const w = await workspace();
	const { t, owner, manager, member, outsider, managerId, organizationId, projectId } = w;
	await t.run((ctx) => seedFeedback(ctx, w, 60));
	await owner.mutation(api.projects.mutations.create, { organizationId, name: "Second", description: "" });
	await t.mutation(internal.setup.admin.assignUserAccess, {
		userId: managerId, organizationId, roleNames: ["admin"], projectIds: [],
	});

	await expect(
		manager.mutation(api.organizations.deletion.remove, { organizationId, confirmName: "Acme" }),
	).rejects.toThrow("Only the organization owner can delete it.");
	await expect(
		member.mutation(api.organizations.deletion.remove, { organizationId, confirmName: "Acme" }),
	).rejects.toThrow("Only organization administrators");
	await expect(
		outsider.mutation(api.organizations.deletion.remove, { organizationId, confirmName: "Acme" }),
	).rejects.toThrow("Organization access denied.");
	await expect(
		owner.mutation(api.organizations.deletion.remove, { organizationId, confirmName: "acme" }),
	).rejects.toThrow("Type the organization name exactly");

	await owner.mutation(api.organizations.deletion.remove, { organizationId, confirmName: "Acme" });
	for (const caller of [owner, manager, member]) {
		await expect(caller.query(api.organizations.queries.mine, {})).resolves.toEqual([]);
		await expect(caller.query(api.projects.queries.list, {})).resolves.toEqual([]);
	}
	// Nothing is purged inside the 7-day restore window; afterwards everything is.
	vi.advanceTimersByTime(7 * DAY);
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	const remaining = await t.run(async (ctx) => ({
		organization: await ctx.db.get("organizations", organizationId),
		projects: await ctx.db.query("projects").withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).collect(),
		members: await ctx.db.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) => q.eq("organizationId", organizationId)).collect(),
		taxonomies: await ctx.db.query("taxonomies")
			.withIndex("by_organizationId_key", (q) => q.eq("organizationId", organizationId)).collect(),
		feedback: await ctx.db.query("feedback").withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", projectId)).collect(),
	}));
	expect(remaining).toEqual({ organization: null, projects: [], members: [], taxonomies: [], feedback: [] });
	expect(await aggregateTotal(t, projectId)).toBe(0);
	// The outsider's own workspace is untouched.
	await expect(outsider.query(api.organizations.queries.mine, {})).resolves.toHaveLength(1);
}, 120_000);

test("account deletion is refused for owners and removes memberships and auth data", async () => {
	const w = await workspace();
	const { t, owner, member, ownerId, memberId, managerId, projectSlug, organizationId } = w;
	const [assigned] = await t.run((ctx) => seedFeedback(ctx, w, 1, memberId));
	await member.mutation(api.feedback.mutations.addComment, { projectSlug, feedbackId: assigned, body: "On it." });
	const auth = await t.run(async (ctx) => {
		const accountId = await ctx.db.insert("authAccounts", {
			userId: memberId, provider: "password", providerAccountId: "member@example.com",
		});
		await ctx.db.insert("authVerificationCodes", {
			accountId, provider: "password", code: "hash", expirationTime: Date.now() + 1000,
		});
		const sessionId = await ctx.db.insert("authSessions", { userId: memberId, expirationTime: Date.now() + DAY });
		await ctx.db.insert("authRefreshTokens", { sessionId, expirationTime: Date.now() + DAY });
		await ctx.db.insert("emailChangeRequests", {
			userId: memberId, email: "new@example.com", codeHash: "x", expiresAt: Date.now() + 1000, attempts: 0,
		});
		const roleId = (await ctx.db.query("roles").withIndex("by_name", (q) => q.eq("name", "member")).unique())!._id;
		const project = (await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique())!;
		await ctx.db.insert("projectInvitations", {
			projectId: project._id, roleId, token: "made-by-member", createdBy: memberId, expiresAt: Date.now() + 1000,
		});
		return { accountId, sessionId };
	});

	await expect(
		t.mutation(internal.users.deletion.performDeletion, { userId: ownerId, confirmation: "owner@example.com" }),
	).rejects.toThrow("You own Acme. Transfer ownership or delete that organization");
	await expect(
		t.mutation(internal.users.deletion.performDeletion, { userId: memberId, confirmation: "someone@example.com" }),
	).rejects.toThrow("Type your email address exactly to confirm.");

	await t.mutation(internal.users.deletion.performDeletion, { userId: memberId, confirmation: "member@example.com" });
	await t.finishAllScheduledFunctions(() => {});
	const remaining = await t.run(async (ctx) => ({
		user: await ctx.db.get("users", memberId),
		accounts: await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", memberId)).collect(),
		codes: await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", auth.accountId)).collect(),
		sessions: await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", memberId)).collect(),
		tokens: await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", auth.sessionId)).collect(),
		requests: await ctx.db.query("emailChangeRequests").withIndex("by_userId", (q) => q.eq("userId", memberId)).collect(),
		invitations: await ctx.db.query("projectInvitations").withIndex("by_createdBy", (q) => q.eq("createdBy", memberId)).collect(),
		links: await ctx.db.query("projectMembers").withIndex("by_userId", (q) => q.eq("userId", memberId)).collect(),
		memberships: await ctx.db.query("organizationMembers").withIndex("by_userId", (q) => q.eq("userId", memberId)).collect(),
		item: await ctx.db.get("feedback", assigned),
	}));
	expect(remaining).toEqual({
		user: null, accounts: [], codes: [], sessions: [], tokens: [], requests: [],
		invitations: [], links: [], memberships: [], item: expect.objectContaining({ assigneeId: null }),
	});
	// History stays and renders the author as a former member.
	const detail = await owner.query(api.feedback.queries.detail, { projectSlug, feedbackId: assigned });
	expect(detail?.comments.map((comment) => comment.author)).toEqual(["Former member"]);

	// After transferring ownership, the former owner can delete their account
	// and the new owner keeps the organization (owner stays an admin).
	await t.mutation(internal.setup.admin.assignUserAccess, {
		userId: managerId, organizationId, roleNames: ["admin"], projectIds: [],
	});
	await owner.mutation(api.organizations.mutations.transferOwnership, { organizationId, userId: managerId });
	// Portal would be left without a project administrator: refused until
	// someone else administers it.
	await expect(
		t.mutation(internal.users.deletion.performDeletion, { userId: ownerId, confirmation: "OWNER@example.com" }),
	).rejects.toThrow("You are the only administrator of Portal.");
	await owner.mutation(api.team.mutations.setMemberRole, {
		projectSlug, memberId: managerId, roleId: w.roleId("admin"),
	});
	await t.mutation(internal.users.deletion.performDeletion, { userId: ownerId, confirmation: "OWNER@example.com" });
	await t.finishAllScheduledFunctions(() => {});
	const manager = t.withIdentity({ subject: managerId });
	await expect(manager.query(api.organizations.queries.settings, { organizationId })).resolves.toMatchObject({
		isOwner: true,
	});
	expect(await t.run((ctx) => ctx.db.get("users", ownerId))).toBeNull();
}, 60_000);
