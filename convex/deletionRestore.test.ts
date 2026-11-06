/**
 * Restore window for project and organization deletion: hidden at once,
 * purged only after 7 days, restorable by the right people within limits,
 * stale purge jobs never purge a later request early, and account deletion
 * purges the owner's deleted organizations at once.
 */
import { newConvexTest } from "../test/convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { insertFeedbackRow } from "./feedback/store";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubEnv("TURNSTILE_SECRET_KEY", "");
	vi.stubEnv("INTAKE_CAPTCHA_DISABLED", "true");
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

/** Owner's "Acme" with project "Portal" (manager joined by link), plus an outsider. */
async function workspace() {
	const t = newConvexTest(modules);
	const [ownerId, managerId, outsiderId] = await t.run(async (ctx) => [
		await ctx.db.insert("users", { name: "Olive Owner", email: "owner@example.com" }),
		await ctx.db.insert("users", { name: "Max Manager", email: "manager@example.com" }),
		await ctx.db.insert("users", { name: "Oscar Outsider", email: "outsider@example.com" }),
	]);
	const owner = t.withIdentity({ subject: ownerId });
	const manager = t.withIdentity({ subject: managerId });
	const outsider = t.withIdentity({ subject: outsiderId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, {
		name: "Acme",
		projectName: "Portal",
	});
	await outsider.mutation(api.setup.mutations.createWorkspace, { name: "Other", projectName: "Elsewhere" });
	const { roles } = await owner.query(api.projects.settings.roles, { projectSlug });
	const roleId = (name: string) => roles.find((role) => role.name === name)!.id;
	const { token } = await owner.action(api.invitations.actions.create, {
		projectSlug, roleId: roleId("manager"), expiresInHours: 1,
	});
	await manager.mutation(api.invitations.mutations.accept, { token });
	const project = await t.run(async (ctx) =>
		(await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique())!,
	);
	const taxonomies = await owner.query(api.taxonomies.queries.list, { projectSlug });
	const fields = {
		category: taxonomies.categories[0].value,
		priority: taxonomies.priorities[0].value,
		status: taxonomies.statuses.find((status) => !status.isFinal)!.value,
	};
	await t.run(async (ctx) => {
		for (let index = 0; index < 5; index++)
			await insertFeedbackRow(ctx, {
				projectId: project._id, title: `Item ${index}`, description: "Seeded", ...fields,
				assigneeId: null, sender: null, receivedAt: Date.now(), updatedAt: Date.now(),
			});
	});
	return {
		t, owner, manager, outsider, ownerId, managerId, outsiderId,
		projectSlug, projectId: project._id, organizationId: project.organizationId, roleId,
	};
}

type Test = Awaited<ReturnType<typeof workspace>>["t"];

const auditActions = (t: Test, organizationId: Id<"organizations">) =>
	t.run(async (ctx) =>
		(await ctx.db.query("auditLogs").withIndex("by_organizationId_at", (q) => q.eq("organizationId", organizationId)).collect())
			.map((entry) => entry.action),
	);

test("a deleted project stays hidden but intact for 7 days and comes back with its settings", async () => {
	const { t, owner, manager, outsider, projectSlug, projectId, organizationId } = await workspace();
	await t.run((ctx) =>
		ctx.db.patch("projects", projectId, { status: "Paused", inboxEnabled: true, weeklyDigest: true }),
	);
	await owner.mutation(api.projects.deletion.remove, { projectSlug, confirmName: "Portal" });
	await expect(owner.query(api.projects.queries.list, {})).resolves.toEqual([]);
	await expect(t.query(api.intake.public.form, { projectSlug })).resolves.toEqual({ accepting: false });
	const listed = await owner.query(api.projects.deletion.deleted, { organizationId });
	expect(listed).toEqual([expect.objectContaining({ id: projectId, name: "Portal" })]);
	expect(listed[0].purgeAt - listed[0].deletedAt).toBe(7 * DAY);
	await expect(manager.query(api.projects.deletion.deleted, { organizationId })).rejects.toThrow(
		"Only organization administrators",
	);

	// Six days later nothing was purged.
	vi.advanceTimersByTime(6 * DAY);
	await t.finishInProgressScheduledFunctions();
	const kept = await t.run(async (ctx) => ({
		project: await ctx.db.get("projects", projectId),
		feedback: (await ctx.db.query("feedback").withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", projectId)).collect()).length,
	}));
	expect(kept.project?.deletionRequestedAt).toBeDefined();
	expect(kept.feedback).toBe(5);

	// Project admins who are not organization admins, and outsiders, cannot restore.
	await expect(manager.mutation(api.projects.deletion.restore, { projectId })).rejects.toThrow(
		"Only organization administrators",
	);
	await expect(outsider.mutation(api.projects.deletion.restore, { projectId })).rejects.toThrow(
		"Organization access denied.",
	);
	await expect(owner.mutation(api.projects.deletion.restore, { projectId })).resolves.toEqual({ slug: projectSlug });
	const restored = await t.run((ctx) => ctx.db.get("projects", projectId));
	expect(restored).toMatchObject({ status: "Paused", inboxEnabled: true, weeklyDigest: true, slug: projectSlug });
	expect(restored?.deletionRequestedAt).toBeUndefined();
	expect(restored?.deletion).toBeUndefined();
	await expect(owner.query(api.projects.queries.list, {})).resolves.toHaveLength(1);
	expect(await auditActions(t, organizationId)).toEqual(
		expect.arrayContaining(["project.deletion_requested", "project.restored"]),
	);

	// The cancelled purge never runs.
	vi.advanceTimersByTime(2 * DAY);
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	expect(await t.run((ctx) => ctx.db.get("projects", projectId))).not.toBeNull();
}, 60_000);

test("a purge job from an earlier request never purges a later deletion early", async () => {
	const { t, owner, projectSlug, projectId } = await workspace();
	await owner.mutation(api.projects.deletion.remove, { projectSlug, confirmName: "Portal" });
	const first = (await t.run((ctx) => ctx.db.get("projects", projectId)))!.deletionRequestedAt!;
	vi.advanceTimersByTime(DAY);
	await owner.mutation(api.projects.deletion.restore, { projectId });
	vi.advanceTimersByTime(DAY);
	await owner.mutation(api.projects.deletion.remove, { projectSlug, confirmName: "Portal" });

	// A leftover job for the first request (even if it had not been cancelled).
	await t.mutation(internal.projects.deletion.purge, { projectId, requestedAt: first });
	await t.finishInProgressScheduledFunctions();
	const project = await t.run((ctx) => ctx.db.get("projects", projectId));
	expect(project?.deletionRequestedAt).toBe(first + 2 * DAY);
	const feedback = await t.run((ctx) =>
		ctx.db.query("feedback").withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", projectId)).collect(),
	);
	expect(feedback).toHaveLength(5);

	// The second request's own job purges after its full window; the slug is
	// retired only then.
	vi.advanceTimersByTime(7 * DAY);
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	const after = await t.run(async (ctx) => ({
		project: await ctx.db.get("projects", projectId),
		retired: await ctx.db.query("retiredSlugs").withIndex("by_slug_kind", (q) => q.eq("slug", projectSlug).eq("kind", "project")).first(),
	}));
	expect(after.project).toBeNull();
	expect(after.retired).not.toBeNull();
	await expect(owner.mutation(api.projects.deletion.restore, { projectId })).rejects.toThrow("Project not found.");
}, 60_000);

test("project restore respects the project cap, live names and the deleted slug stays reserved", async () => {
	const { t, owner, projectSlug, projectId, organizationId } = await workspace();
	await owner.mutation(api.projects.deletion.remove, { projectSlug, confirmName: "Portal" });

	// The slug is still taken while the project waits: a new "Portal" gets another one.
	const created = await owner.mutation(api.projects.mutations.create, { organizationId, name: "Portal", description: "" });
	expect(created.slug).not.toBe(projectSlug);
	await expect(owner.mutation(api.projects.deletion.restore, { projectId })).rejects.toThrow(
		"already has a project named Portal",
	);
	const duplicate = await t.run(async (ctx) =>
		(await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", created.slug)).unique())!._id,
	);
	await t.run((ctx) => ctx.db.patch("projects", duplicate, { name: "Portal (new)" }));

	// Fill the organization up to the cap with live projects.
	const fillers = await t.run(async (ctx) => {
		const ids: Id<"projects">[] = [];
		for (let index = 0; index < 49; index++)
			ids.push(await ctx.db.insert("projects", {
				organizationId, name: `Filler ${index}`, slug: `filler-${index}`, description: "",
				status: "Active", inboxEnabled: false, defaultPriority: "Medium",
				criticalAlerts: false, weeklyDigest: false,
			}));
		return ids;
	});
	await expect(owner.mutation(api.projects.deletion.restore, { projectId })).rejects.toThrow(
		"can have up to 50 projects",
	);
	await t.run((ctx) => ctx.db.delete("projects", fillers[0]));
	await expect(owner.mutation(api.projects.deletion.restore, { projectId })).resolves.toEqual({ slug: projectSlug });
}, 60_000);

test("organization restore is owner-only, respects the owned cap and keeps separately deleted projects deleted", async () => {
	const { t, owner, manager, ownerId, managerId, projectSlug, projectId, organizationId } = await workspace();
	const second = await owner.mutation(api.projects.mutations.create, { organizationId, name: "Second", description: "" });
	await t.mutation(internal.setup.admin.assignUserAccess, {
		userId: managerId, organizationId, roleNames: ["admin"], projectIds: [],
	});
	// "Second" is deleted on its own first; then the whole organization.
	await owner.mutation(api.projects.deletion.remove, { projectSlug: second.slug, confirmName: "Second" });
	await owner.mutation(api.organizations.deletion.remove, { organizationId, confirmName: "Acme" });
	await expect(owner.query(api.organizations.queries.mine, {})).resolves.toEqual([]);
	await expect(owner.query(api.organizations.deletion.deleted, {})).resolves.toEqual([
		expect.objectContaining({ id: organizationId, name: "Acme" }),
	]);
	await expect(manager.query(api.organizations.deletion.deleted, {})).resolves.toEqual([]);

	vi.advanceTimersByTime(3 * DAY);
	await t.finishInProgressScheduledFunctions();
	await expect(manager.mutation(api.organizations.deletion.restore, { organizationId })).rejects.toThrow(
		"Organization not found.",
	);

	// Owning the maximum number of live organizations blocks the restore.
	const extra = await t.run(async (ctx) => {
		const ids: Id<"organizations">[] = [];
		for (let index = 0; index < 10; index++)
			ids.push(await ctx.db.insert("organizations", { name: `Org ${index}`, slug: `org-${index}`, ownerId }));
		return ids;
	});
	await expect(owner.mutation(api.organizations.deletion.restore, { organizationId })).rejects.toThrow(
		"You can own up to 10 workspaces",
	);
	await t.run((ctx) => ctx.db.delete("organizations", extra[0]));
	await owner.mutation(api.organizations.deletion.restore, { organizationId });

	const projects = await owner.query(api.projects.queries.list, {});
	expect(projects.map((project) => project.slug)).toEqual([projectSlug]);
	const secondDoc = await t.run(async (ctx) =>
		(await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", second.slug)).unique())!,
	);
	expect(secondDoc.deletionRequestedAt).toBeDefined();
	expect(await auditActions(t, organizationId)).toEqual(
		expect.arrayContaining(["organization.deletion_requested", "organization.restored"]),
	);

	// The organization's own purge was cancelled; "Second" still goes after its window.
	vi.advanceTimersByTime(8 * DAY);
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	const after = await t.run(async (ctx) => ({
		organization: await ctx.db.get("organizations", organizationId),
		portal: await ctx.db.get("projects", projectId),
		second: await ctx.db.get("projects", secondDoc._id),
	}));
	expect(after.organization?.deletionRequestedAt).toBeUndefined();
	expect(after.portal?.deletionRequestedAt).toBeUndefined();
	expect(after.second).toBeNull();
}, 60_000);

test("an organization is purged after 7 days, audit entries included", async () => {
	const { t, owner, organizationId, projectId } = await workspace();
	await owner.mutation(api.organizations.deletion.remove, { organizationId, confirmName: "Acme" });
	vi.advanceTimersByTime(6 * DAY);
	await t.finishInProgressScheduledFunctions();
	expect(await t.run((ctx) => ctx.db.get("organizations", organizationId))).not.toBeNull();
	vi.advanceTimersByTime(DAY);
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	const after = await t.run(async (ctx) => ({
		organization: await ctx.db.get("organizations", organizationId),
		project: await ctx.db.get("projects", projectId),
		audit: await ctx.db.query("auditLogs").withIndex("by_organizationId_at", (q) => q.eq("organizationId", organizationId)).collect(),
	}));
	expect(after).toEqual({ organization: null, project: null, audit: [] });
}, 60_000);

test("deleting the owner's account purges their deleted organizations at once", async () => {
	const { t, owner, ownerId, organizationId, projectId } = await workspace();
	await owner.mutation(api.organizations.deletion.remove, { organizationId, confirmName: "Acme" });
	await t.mutation(internal.users.deletion.performDeletion, { userId: ownerId, confirmation: "owner@example.com" });
	// Far less than the 7-day window: one second per pump.
	await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1000));
	const after = await t.run(async (ctx) => ({
		organization: await ctx.db.get("organizations", organizationId),
		project: await ctx.db.get("projects", projectId),
	}));
	expect(after).toEqual({ organization: null, project: null });
}, 60_000);
