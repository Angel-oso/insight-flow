/**
 * Membership caps on invitations, organization deletion with many project
 * documents, deleted organizations shutting their projects down, and the
 * invitation email's anti-phishing rules.
 */
import { newConvexTest } from "../test/convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { emailSafeName, projectInvitationEmail } from "./email/invitationTemplate";
import { PROJECT_MEMBER_LIMIT } from "./feedback/access";
import { webhookUrlFingerprint } from "./integrations/signature";
import { ORGANIZATION_MEMBER_LIMIT } from "./organizations/members";
import { rateLimiter } from "./rateLimits";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
	vi.stubEnv("EMAIL_DEV_LOG", "true");
	vi.stubEnv("TURNSTILE_SECRET_KEY", "");
	vi.stubEnv("INTAKE_CAPTCHA_DISABLED", "true");
	vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

async function workspace() {
	const t = newConvexTest(modules);
	const [ownerId, inviteeId, unverifiedId] = await t.run(async (ctx) => [
		await ctx.db.insert("users", { name: "Olive Owner", email: "owner@example.com", emailVerificationTime: 1 }),
		await ctx.db.insert("users", { name: "Ivy Invitee", email: "ivy@example.com" }),
		await ctx.db.insert("users", { name: "Una Unverified", email: "una@example.com" }),
	]);
	const owner = t.withIdentity({ subject: ownerId });
	const invitee = t.withIdentity({ subject: inviteeId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, {
		name: "Acme",
		projectName: "Portal",
	});
	const { roles } = await owner.query(api.projects.settings.roles, { projectSlug });
	const roleId = (name: string) => roles.find((role) => role.name === name)!.id;
	const project = await t.run(async (ctx) =>
		(await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique())!,
	);
	const link = () =>
		owner.action(api.invitations.actions.create, { projectSlug, roleId: roleId("member"), expiresInHours: 1 });
	return {
		t, owner, invitee, ownerId, inviteeId, unverifiedId, projectSlug, roleId, link,
		projectId: project._id, organizationId: project.organizationId,
	};
}

type Test = Awaited<ReturnType<typeof workspace>>["t"];

/** Adds filler users until the project has `count` links (no org memberships). */
async function fillProject(t: Test, projectId: Id<"projects">, count: number) {
	await t.run(async (ctx) => {
		const existing = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId))
			.collect();
		for (let index = existing.length; index < count; index++) {
			const userId = await ctx.db.insert("users", { name: `Filler ${index}` });
			await ctx.db.insert("projectMembers", { projectId, userId, joinedAt: 1 });
		}
	});
}

async function fillOrganization(t: Test, organizationId: Id<"organizations">, count: number) {
	await t.run(async (ctx) => {
		const memberRole = (await ctx.db.query("roles").withIndex("by_name", (q) => q.eq("name", "member")).first())!;
		const existing = await ctx.db
			.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) => q.eq("organizationId", organizationId))
			.collect();
		for (let index = existing.length; index < count; index++) {
			const userId = await ctx.db.insert("users", { name: `Org filler ${index}` });
			await ctx.db.insert("organizationMembers", { organizationId, userId, roleIds: [memberRole._id] });
		}
	});
}

const invitationByToken = (t: Test, token: string) =>
	t.run((ctx) => ctx.db.query("projectInvitations").withIndex("by_token", (q) => q.eq("token", token)).unique());

test("a full project refuses new invitations and accepts without burning the link", async () => {
	const { t, owner, invitee, ownerId, projectSlug, projectId, roleId, link } = await workspace();
	const { token } = await link();
	const { token: ownerToken } = await link();
	await fillProject(t, projectId, PROJECT_MEMBER_LIMIT);

	await expect(invitee.mutation(api.invitations.mutations.accept, { token })).resolves.toMatchObject({
		ok: false, reason: "full",
	});
	expect((await invitationByToken(t, token))?.acceptedAt).toBeUndefined();
	// Someone already in the project adds no row, so the cap does not apply.
	await expect(
		t.withIdentity({ subject: ownerId }).mutation(api.invitations.mutations.accept, { token: ownerToken }),
	).resolves.toMatchObject({ ok: true });

	await expect(link()).rejects.toThrow(`This project has reached its limit of ${PROJECT_MEMBER_LIMIT} members.`);
	await expect(
		owner.action(api.invitations.actions.sendByEmail, {
			projectSlug, roleId: roleId("member"), expiresInHours: 1, email: "new@example.com",
		}),
	).rejects.toThrow("reached its limit");
	await expect(owner.query(api.invitations.queries.inviteStatus, { projectSlug })).resolves.toMatchObject({
		full: "project", canEmail: true,
	});

	// Once there is room, the very same link works.
	await t.run(async (ctx) => {
		const filler = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId))
			.filter((q) => q.eq(q.field("joinedAt"), 1))
			.first();
		await ctx.db.delete("projectMembers", filler!._id);
	});
	await expect(owner.query(api.invitations.queries.inviteStatus, { projectSlug })).resolves.toMatchObject({ full: null });
	await expect(invitee.mutation(api.invitations.mutations.accept, { token })).resolves.toMatchObject({ ok: true });
}, 60_000);

test("a full organization refuses new invitations and new members", async () => {
	const { t, owner, invitee, organizationId, link, projectSlug } = await workspace();
	const { token } = await link();
	await fillOrganization(t, organizationId, ORGANIZATION_MEMBER_LIMIT);

	await expect(invitee.mutation(api.invitations.mutations.accept, { token })).resolves.toMatchObject({
		ok: false, reason: "full",
	});
	await expect(link()).rejects.toThrow(`This organization has reached its limit of ${ORGANIZATION_MEMBER_LIMIT} members.`);
	await expect(owner.query(api.invitations.queries.inviteStatus, { projectSlug })).resolves.toMatchObject({
		full: "organization",
	});
	const members = await t.run((ctx) =>
		ctx.db.query("organizationMembers").withIndex("by_organizationId_userId", (q) => q.eq("organizationId", organizationId)).collect(),
	);
	expect(members).toHaveLength(ORGANIZATION_MEMBER_LIMIT);
}, 60_000);

test("an organization administrator cannot join a full project", async () => {
	const { t, owner, ownerId, projectId, projectSlug, organizationId } = await workspace();
	// The owner left the project (org admins can rejoin), then it filled up.
	await t.run(async (ctx) => {
		const link = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId).eq("userId", ownerId))
			.unique();
		await ctx.db.delete("projectMembers", link!._id);
	});
	await fillProject(t, projectId, PROJECT_MEMBER_LIMIT);
	await expect(
		owner.mutation(api.organizations.members.joinProject, { organizationId, projectSlug }),
	).rejects.toThrow("This project has reached its limit");
}, 60_000);

test("organization deletion marks and restores every live project, however many were deleted before", async () => {
	vi.useFakeTimers();
	const { t, owner, organizationId, projectId } = await workspace();
	const earlier = Date.now() - 60_000;
	const { ownDeleted, live } = await t.run(async (ctx) => {
		const base = {
			organizationId, description: "x", defaultPriority: "Medium",
			criticalAlerts: false, weeklyDigest: false,
		};
		// 120 projects deleted on their own, all created before the live ones.
		const ownDeleted: Id<"projects">[] = [];
		for (let index = 0; index < 120; index++)
			ownDeleted.push(await ctx.db.insert("projects", {
				...base, name: `Old ${index}`, slug: `old-${index}`, status: "Archived", inboxEnabled: false,
				deletionRequestedAt: earlier,
				deletion: { status: "Active", inboxEnabled: true, criticalAlerts: false, weeklyDigest: false },
			}));
		const live: Id<"projects">[] = [projectId];
		for (let index = 0; index < 3; index++)
			live.push(await ctx.db.insert("projects", {
				...base, name: `Live ${index}`, slug: `live-${index}`, status: "Active", inboxEnabled: true,
			}));
		return { ownDeleted, live };
	});

	await owner.mutation(api.organizations.deletion.remove, { organizationId, confirmName: "Acme" });
	const afterDelete = await t.run((ctx) => Promise.all(live.map((id) => ctx.db.get("projects", id))));
	const organization = await t.run((ctx) => ctx.db.get("organizations", organizationId));
	for (const project of afterDelete) {
		expect(project?.deletionRequestedAt).toBe(organization!.deletionRequestedAt);
		expect(project?.deletion?.withOrganization).toBe(true);
	}

	await owner.mutation(api.organizations.deletion.restore, { organizationId });
	const restored = await t.run((ctx) => Promise.all(live.map((id) => ctx.db.get("projects", id))));
	for (const project of restored) expect(project?.deletionRequestedAt).toBeUndefined();
	expect(restored[1]?.inboxEnabled).toBe(true);
	const stillDeleted = await t.run((ctx) => Promise.all(ownDeleted.map((id) => ctx.db.get("projects", id))));
	for (const project of stillDeleted) expect(project?.deletionRequestedAt).toBe(earlier);
}, 120_000);

test("projects of an organization being deleted stop intake, access, webhooks and digests even if unmarked", async () => {
	const { t, owner, ownerId, projectSlug, projectId, organizationId, link } = await workspace();
	const { token } = await link();
	await owner.mutation(api.projects.settings.update, { projectSlug, changes: { inboxEnabled: true, weeklyDigest: true } });
	await expect(t.query(api.intake.public.form, { projectSlug })).resolves.toMatchObject({ accepting: true });
	const url = "https://hooks.example.com/in";
	const webhookId = await t.run((ctx) =>
		ctx.db.insert("webhooks", {
			projectId, name: "Hook", url, format: "json", events: ["feedback.created"], secret: "s",
			enabled: true, consecutiveFailures: 0, createdBy: ownerId, createdAt: 1, updatedAt: 1,
		}),
	);
	const fingerprint = await webhookUrlFingerprint(url);
	await expect(
		t.query(internal.integrations.delivery.prepare, { webhookId, urlFingerprint: fingerprint, event: "webhook.test" }),
	).resolves.not.toBeNull();

	// Only the organization carries the mark (as for a project past the mark bound).
	await t.run((ctx) => ctx.db.patch("organizations", organizationId, { deletionRequestedAt: Date.now() }));
	await expect(t.query(api.intake.public.form, { projectSlug })).resolves.toEqual({ accepting: false });
	await expect(
		t.action(api.intake.public.submit, { projectSlug, title: "Hello there", description: "A public note.", category: "bug" }),
	).rejects.toThrow("This feedback link is not accepting submissions.");
	await expect(
		t.query(internal.integrations.delivery.prepare, { webhookId, urlFingerprint: fingerprint, event: "webhook.test" }),
	).resolves.toBeNull();
	await expect(
		t.mutation(internal.notifications.digest.sendProjectDigest, { projectId, windowEnd: Date.now() }),
	).resolves.toBeNull();
	await expect(t.mutation(internal.notifications.digest.run, { cursor: null })).resolves.toMatchObject({ scheduled: 0 });
	await expect(owner.query(api.projects.queries.list, {})).resolves.toEqual([]);
	const invitee = t.withIdentity({ subject: (await t.run((ctx) => ctx.db.insert("users", { name: "Late" }))) });
	await expect(invitee.query(api.invitations.queries.preview, { token })).resolves.toBeNull();
}, 60_000);

test("the project list skips projects being deleted and fails with a friendly error", async () => {
	const { t, owner, ownerId, organizationId } = await workspace();
	await t.run(async (ctx) => {
		for (let index = 0; index < 150; index++) {
			const projectId = await ctx.db.insert("projects", {
				organizationId, name: `Gone ${index}`, slug: `gone-${index}`, description: "x", status: "Archived",
				inboxEnabled: false, defaultPriority: "Medium", criticalAlerts: false, weeklyDigest: false,
				deletionRequestedAt: 1,
			});
			await ctx.db.insert("projectMembers", { projectId, userId: ownerId, joinedAt: 1 });
		}
	});
	await expect(owner.query(api.projects.queries.list, {})).resolves.toHaveLength(1);
	await t.run(async (ctx) => {
		for (let index = 0; index < 60; index++) {
			const projectId = await ctx.db.insert("projects", {
				organizationId, name: `More ${index}`, slug: `more-${index}`, description: "x", status: "Archived",
				inboxEnabled: false, defaultPriority: "Medium", criticalAlerts: false, weeklyDigest: false,
				deletionRequestedAt: 1,
			});
			await ctx.db.insert("projectMembers", { projectId, userId: ownerId, joinedAt: 1 });
		}
	});
	const error = await owner.query(api.projects.queries.list, {}).catch((cause: unknown) => cause);
	expect(error).toBeInstanceOf(Error);
	expect(String((error as { data?: unknown }).data)).toContain("too many projects");
}, 60_000);

test("names that look like links or domains never reach the invitation email", () => {
	for (const bad of [
		"evil.example", "Visit evil.com now", "https://x", "www team", "a@b", "javascript:alert",
		"pay．example", "login。example", "‮evil", "hxxp://x.y",
	])
		expect(emailSafeName(bad)).toBeNull();
	for (const ok of ["Acme Inc.", "St. Louis Team", "Portal v2.0", "Mia Member", "Portal <script>"])
		expect(emailSafeName(ok)).toBe(ok);

	const email = projectInvitationEmail({
		projectName: "Reset your password at evil.example",
		organizationName: "Acme",
		inviterName: "Support (support@evil.example)",
		role: "member",
		inviteUrl: "https://app.example/invitations/abc",
		expires: new Date(Date.now() + 3_600_000),
	});
	expect(email.text).not.toContain("evil");
	expect(email.html).not.toContain("evil");
	expect(email.text).toContain("A teammate invited you to join a project in Acme on InsightFlow as member.");
});

test("email invitations need a verified inviter and respect the organization's daily budget", async () => {
	const { t, owner, unverifiedId, projectSlug, projectId, organizationId, roleId } = await workspace();
	// Make the unverified user a project admin, so only verification is missing.
	await t.run(async (ctx) => {
		const adminRole = (await ctx.db.query("roles").withIndex("by_projectId_name", (q) => q.eq("projectId", undefined).eq("name", "admin")).unique())!;
		await ctx.db.insert("organizationMembers", { organizationId, userId: unverifiedId, roleIds: [adminRole._id] });
		await ctx.db.insert("projectMembers", { projectId, userId: unverifiedId, roleId: adminRole._id, joinedAt: 1 });
	});
	const unverified = t.withIdentity({ subject: unverifiedId });
	const send = (who: typeof owner, email: string) =>
		who.action(api.invitations.actions.sendByEmail, { projectSlug, roleId: roleId("member"), expiresInHours: 1, email });
	await expect(send(unverified, "x@example.com")).rejects.toThrow("Verify your email address");
	await expect(unverified.query(api.invitations.queries.inviteStatus, { projectSlug })).resolves.toMatchObject({ canEmail: false });
	// Links still work for unverified admins.
	await expect(
		unverified.action(api.invitations.actions.create, { projectSlug, roleId: roleId("member"), expiresInHours: 1 }),
	).resolves.toHaveProperty("token");

	await send(owner, "first@example.com");
	await t.run((ctx: MutationCtx) =>
		rateLimiter.limit(ctx, "inviteEmailOrganization", { key: organizationId, count: 99 }),
	);
	await expect(send(owner, "second@example.com")).rejects.toThrow(
		"This organization has sent many email invitations today.",
	);
}, 60_000);

test("revoking an emailed invitation masks the address in the audit log", async () => {
	const { t, owner, projectSlug, organizationId, roleId } = await workspace();
	await owner.action(api.invitations.actions.sendByEmail, {
		projectSlug, roleId: roleId("member"), expiresInHours: 1, email: "secret.person@example.com",
	});
	const [pending] = await owner.query(api.invitations.queries.pending, { projectSlug, now: Date.now() });
	await owner.mutation(api.invitations.mutations.revoke, { projectSlug, invitationId: pending.id });
	const summaries = await t.run(async (ctx) =>
		(await ctx.db.query("auditLogs").withIndex("by_organizationId_at", (q) => q.eq("organizationId", organizationId)).collect())
			.map((entry) => entry.summary),
	);
	expect(summaries.some((summary) => summary.includes("Revoked the invitation sent to s***@example.com"))).toBe(true);
	expect(summaries.join("\n")).not.toContain("secret.person");
}, 60_000);
