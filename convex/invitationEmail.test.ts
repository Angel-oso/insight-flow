/**
 * Invitations sent by email (validation, permissions, rate limits, single
 * use, no account disclosure) and the pending-link cleanup cursor.
 */
import { newConvexTest } from "../test/convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { projectInvitationEmail } from "./email/invitationTemplate";
import { maskEmail, normalizeInviteEmail, revokeCreatorLinks } from "./invitations/mutations";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
	vi.stubEnv("EMAIL_DEV_LOG", "true");
	vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

async function workspace() {
	const t = newConvexTest(modules);
	const [ownerId, memberId, inviteeId, otherId] = await t.run(async (ctx) => [
		await ctx.db.insert("users", { name: "Olive Owner", email: "owner@example.com", emailVerificationTime: 1 }),
		await ctx.db.insert("users", { name: "Mia Member", email: "member@example.com", emailVerificationTime: 1 }),
		await ctx.db.insert("users", { name: "Ivy Invitee", email: "ivy@example.com" }),
		await ctx.db.insert("users", { name: "Otto Other", email: "otto@example.com" }),
	]);
	const owner = t.withIdentity({ subject: ownerId });
	const member = t.withIdentity({ subject: memberId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, {
		name: "Acme",
		projectName: "Portal",
	});
	const { roles } = await owner.query(api.projects.settings.roles, { projectSlug });
	const roleId = (name: string) => roles.find((role) => role.name === name)!.id;
	const { token } = await owner.action(api.invitations.actions.create, {
		projectSlug, roleId: roleId("member"), expiresInHours: 1,
	});
	await member.mutation(api.invitations.mutations.accept, { token });
	const project = await t.run(async (ctx) =>
		(await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique())!,
	);
	return {
		t, owner, member, ownerId, memberId, inviteeId, otherId, projectSlug, roleId,
		projectId: project._id, organizationId: project.organizationId,
	};
}

test("email addresses are normalized and anything but one plain address is rejected", () => {
	expect(normalizeInviteEmail("  New.Person@Example.COM ")).toBe("new.person@example.com");
	for (const bad of ["", "nope", "a@b", "a@b.com, c@d.com", "Name <a@b.com>", "a b@c.com", "a@-b.com", `${"x".repeat(250)}@b.com`])
		expect(normalizeInviteEmail(bad)).toBeNull();
});

test("an emailed invitation is single-use, never returns the link and is audited", async () => {
	const { t, owner, member, inviteeId, otherId, projectSlug, projectId, organizationId, roleId } = await workspace();
	const send = (email: string) =>
		owner.action(api.invitations.actions.sendByEmail, { projectSlug, roleId: roleId("member"), expiresInHours: 24, email });

	await expect(send("not an email")).rejects.toThrow("Enter a valid email address.");
	await expect(
		member.action(api.invitations.actions.sendByEmail, { projectSlug, roleId: roleId("member"), expiresInHours: 1, email: "x@example.com" }),
	).rejects.toThrow("You cannot invite members to this project.");

	// Same answer for a registered and an unknown address; no token comes back.
	const known = await send(" IVY@example.com ");
	const unknown = await send("nobody@example.com");
	expect(Object.keys(known).sort()).toEqual(["email", "expiresAt"]);
	expect(Object.keys(unknown).sort()).toEqual(["email", "expiresAt"]);
	expect(known.email).toBe("ivy@example.com");

	const pending = await owner.query(api.invitations.queries.pending, { projectSlug, now: Date.now() });
	expect(pending.map((link) => link.email).sort()).toEqual(["ivy@example.com", "nobody@example.com"]);
	expect(console.log).toHaveBeenCalledWith(expect.stringContaining("/invitations/"));

	const invitation = await t.run(async (ctx) =>
		(await ctx.db.query("projectInvitations").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect())
			.find((row) => row.email === "ivy@example.com")!,
	);
	const invitee = t.withIdentity({ subject: inviteeId });
	const other = t.withIdentity({ subject: otherId });
	await expect(invitee.mutation(api.invitations.mutations.accept, { token: invitation.token })).resolves.toMatchObject({ ok: true });
	await expect(other.mutation(api.invitations.mutations.accept, { token: invitation.token })).resolves.toMatchObject({
		ok: false, reason: "used",
	});

	const nobody = pending.find((link) => link.email === "nobody@example.com")!;
	await owner.mutation(api.invitations.mutations.revoke, { projectSlug, invitationId: nobody.id });
	const actions = await t.run(async (ctx) =>
		(await ctx.db.query("auditLogs").withIndex("by_organizationId_at", (q) => q.eq("organizationId", organizationId)).collect())
			.map((entry) => entry.action),
	);
	expect(actions).toEqual(expect.arrayContaining(["invitation.created", "invitation.accepted", "invitation.revoked"]));
}, 60_000);

test("suppressed addresses get no email, with the same answer; subject and audit hide user data", async () => {
	const { t, owner, projectSlug, projectId, organizationId, roleId } = await workspace();
	await t.run(async (ctx) => {
		const users = await ctx.db.query("users").collect();
		const olive = users.find((user) => user.email === "owner@example.com")!;
		await ctx.db.patch("users", olive._id, { name: "<b>Olive</b> & Co" });
		await ctx.db.patch("projects", projectId, { name: "Portal <script>" });
		await ctx.db.insert("emailSuppressions", { email: "bounced@example.com", reason: "bounced", at: Date.now() });
	});
	vi.mocked(console.log).mockClear();
	const send = (email: string) =>
		owner.action(api.invitations.actions.sendByEmail, { projectSlug, roleId: roleId("member"), expiresInHours: 1, email });

	const suppressed = await send("Bounced@example.com");
	const delivered = await send("fresh@example.com");
	expect(Object.keys(suppressed).sort()).toEqual(Object.keys(delivered).sort());
	expect(suppressed.email).toBe("bounced@example.com");
	const logged = vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
	expect(logged.some((line) => line.includes("to=bounced@example.com"))).toBe(false);
	const sent = logged.find((line) => line.includes("to=fresh@example.com"))!;
	expect(sent).toContain(`subject="You've been invited to a project on InsightFlow"`);
	expect(sent).not.toMatch(/subject="[^"]*Olive/);

	const { html } = projectInvitationEmail({
		projectName: "Portal <script>", organizationName: "Acme", inviterName: "<b>Olive</b>",
		role: "member", inviteUrl: "https://app.example.com/invitations/x", expires: new Date(Date.now() + 3_600_000),
	});
	expect(html).not.toContain("<script>");
	expect(html).not.toContain("<b>Olive</b>");
	expect(html).toContain("&lt;b&gt;Olive&lt;/b&gt;");

	const summaries = await t.run(async (ctx) =>
		(await ctx.db.query("auditLogs").withIndex("by_organizationId_at", (q) => q.eq("organizationId", organizationId)).collect())
			.filter((entry) => entry.action === "invitation.created")
			.map((entry) => entry.summary),
	);
	expect(summaries.join("\n")).not.toMatch(/bounced@example\.com|fresh@example\.com/);
	expect(summaries).toEqual(expect.arrayContaining([expect.stringContaining("b***@example.com"), expect.stringContaining("f***@example.com")]));
	expect(maskEmail("jane@example.com")).toBe("j***@example.com");
}, 60_000);

test("email invitations are rate limited per recipient and per inviter", async () => {
	const { owner, projectSlug, roleId } = await workspace();
	const send = (email: string) =>
		owner.action(api.invitations.actions.sendByEmail, { projectSlug, roleId: roleId("member"), expiresInHours: 1, email });
	for (let index = 0; index < 3; index++) await send("target@example.com");
	await expect(send("TARGET@example.com")).rejects.toThrow("This address has received several invitations recently.");
	// The failed attempt was rolled back, so the inviter still has 7 of 10.
	for (let index = 0; index < 7; index++) await send(`person${index}@example.com`);
	await expect(send("one-more@example.com")).rejects.toThrow("You've sent several email invitations recently.");
}, 60_000);

test("no invitation is created when email delivery is not configured", async () => {
	const { t, owner, projectSlug, projectId, roleId } = await workspace();
	vi.stubEnv("EMAIL_DEV_LOG", "");
	vi.stubEnv("RESEND_API_KEY", "");
	vi.spyOn(console, "error").mockImplementation(() => {});
	await expect(
		owner.action(api.invitations.actions.sendByEmail, { projectSlug, roleId: roleId("member"), expiresInHours: 1, email: "x@example.com" }),
	).rejects.toThrow("Email delivery isn't configured yet.");
	const rows = await t.run((ctx) =>
		ctx.db.query("projectInvitations").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
	);
	expect(rows.filter((row) => row.email)).toEqual([]);
}, 60_000);

test("pending-link cleanup resumes past links that share an expiry across batches", async () => {
	const { t, ownerId, memberId, projectId } = await workspace();
	const expiresAt = Date.now() + 3_600_000;
	await t.run(async (ctx) => {
		const roleId = (await ctx.db.query("roles").withIndex("by_name", (q) => q.eq("name", "member")).unique())!._id;
		const insert = (createdBy: Id<"users">, index: number) =>
			ctx.db.insert("projectInvitations", { projectId, roleId, token: `t-${createdBy}-${index}`, createdBy, expiresAt });
		// One full batch (200) ends inside the target's links, all with one expiry.
		for (let index = 0; index < 199; index++) await insert(ownerId, index);
		for (let index = 0; index < 5; index++) await insert(memberId, index);
	});
	await t.run((ctx) => revokeCreatorLinks(ctx, projectId, memberId));
	await t.finishAllScheduledFunctions(() => {});
	const left = await t.run(async (ctx) =>
		(await ctx.db.query("projectInvitations").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect())
			.filter((row) => row.acceptedAt === undefined),
	);
	expect(left.filter((row) => row.createdBy === memberId)).toEqual([]);
	expect(left.filter((row) => row.createdBy === ownerId)).toHaveLength(199);
}, 60_000);
