import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./projects/"), load])),
};

/** An owner's workspace with a second member, a custom role, and a live invitation. */
async function archivedWorkspace() {
	const t = convexTest(schema, modules);
	const [ownerId, guestId] = await t.run(async (ctx) => [
		await ctx.db.insert("users", { name: "Owner", email: "owner@example.com" }),
		await ctx.db.insert("users", { name: "Guest", email: "guest@example.com" }),
	]);
	const owner = t.withIdentity({ subject: ownerId });
	const guest = t.withIdentity({ subject: guestId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, {
		name: "Archive Co",
	});
	const roles = await owner.query(api.projects.settings.roles, { projectSlug });
	const memberRole = roles.roles.find((role) => role.name === "member")!;
	const invitation = await owner.action(api.invitations.actions.create, {
		projectSlug,
		roleId: memberRole.id,
		expiresInHours: 1,
	});
	await guest.mutation(api.invitations.mutations.accept, { token: invitation.token });
	const customRole = await owner.mutation(api.projects.settings.createRole, {
		projectSlug,
		name: "Reviewer",
		permissionKeys: ["feedback.comment"],
	});
	await owner.mutation(api.projects.settings.update, {
		projectSlug,
		changes: { status: "Archived" },
	});
	return { t, owner, ownerId, guestId, projectSlug, memberRole, customRole };
}

test("archived projects reject team, role, and invitation writes", async () => {
	const { t, owner, guestId, projectSlug, memberRole, customRole } = await archivedWorkspace();
	const snapshot = () =>
		t.run(async (ctx) => ({
			members: await ctx.db.query("projectMembers").collect(),
			roles: await ctx.db.query("roles").collect(),
			invitations: await ctx.db.query("projectInvitations").collect(),
		}));
	const before = await snapshot();
	const archived = "Archived projects cannot be edited.";

	await expect(
		owner.action(api.invitations.actions.create, {
			projectSlug,
			roleId: memberRole.id,
			expiresInHours: 1,
		}),
	).rejects.toThrow(archived);
	await expect(
		owner.mutation(api.team.mutations.setMemberRole, {
			projectSlug,
			memberId: guestId,
			roleId: customRole.id,
		}),
	).rejects.toThrow(archived);
	await expect(
		owner.mutation(api.team.mutations.removeMember, { projectSlug, memberId: guestId }),
	).rejects.toThrow(archived);
	await expect(
		owner.mutation(api.projects.settings.createRole, {
			projectSlug,
			name: "Auditor",
			permissionKeys: [],
		}),
	).rejects.toThrow(archived);
	await expect(
		owner.mutation(api.projects.settings.deleteRole, { projectSlug, roleId: customRole.id }),
	).rejects.toThrow(archived);
	expect(await snapshot()).toEqual(before);

	// Restore still works and unlocks the same writes.
	await owner.mutation(api.projects.settings.restore, { projectSlug });
	await owner.mutation(api.team.mutations.removeMember, { projectSlug, memberId: guestId });
});

test("archived projects cannot accept new members through old invitations", async () => {
	const t = convexTest(schema, modules);
	const [ownerId, lateId] = await t.run(async (ctx) => [
		await ctx.db.insert("users", { name: "Owner" }),
		await ctx.db.insert("users", { name: "Late" }),
	]);
	const owner = t.withIdentity({ subject: ownerId });
	const late = t.withIdentity({ subject: lateId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, {
		name: "Late Co",
	});
	const roles = await owner.query(api.projects.settings.roles, { projectSlug });
	const { token } = await owner.action(api.invitations.actions.create, {
		projectSlug,
		roleId: roles.roles.find((role) => role.name === "member")!.id,
		expiresInHours: 1,
	});
	await owner.mutation(api.projects.settings.update, {
		projectSlug,
		changes: { status: "Archived" },
	});
	await expect(late.mutation(api.invitations.mutations.accept, { token })).rejects.toThrow(
		"Archived projects cannot be edited.",
	);
	await expect(late.query(api.projects.queries.list, {})).resolves.toEqual([]);
});

test("invitation previews need a session and never read the clock", async () => {
	const t = convexTest(schema, modules);
	const [ownerId, guestId] = await t.run(async (ctx) => [
		await ctx.db.insert("users", { name: "Owner" }),
		await ctx.db.insert("users", { name: "Guest" }),
	]);
	const owner = t.withIdentity({ subject: ownerId });
	const guest = t.withIdentity({ subject: guestId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, {
		name: "Preview Co",
	});
	const roles = await owner.query(api.projects.settings.roles, { projectSlug });
	const { token, expiresAt } = await owner.action(api.invitations.actions.create, {
		projectSlug,
		roleId: roles.roles.find((role) => role.name === "manager")!.id,
		expiresInHours: 6,
	});

	await expect(t.query(api.invitations.queries.preview, { token })).resolves.toBeNull();
	await expect(guest.query(api.invitations.queries.preview, { token })).resolves.toEqual({
		projectName: "Preview Co",
		projectSlug,
		role: "manager",
		expiresAt,
		status: "pending",
	});
	await guest.mutation(api.invitations.mutations.accept, { token });
	await expect(guest.query(api.invitations.queries.preview, { token })).resolves.toMatchObject({
		status: "accepted",
	});
});
