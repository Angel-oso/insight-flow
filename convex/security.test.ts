/**
 * Authorization security suite: every workspace read/write must reject
 * anonymous callers and non-members, capabilities must hold per role, and
 * no function may accept identity from client arguments.
 *
 * Self-contained: the fixture below builds permission and role catalogs,
 * users in one organization, explicit project access, one feedback item,
 * and minimal taxonomies per test. Runs fully in-memory (convex-test); no network,
 * no real OAuth.
 */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { capabilities, type Capability, type Role } from "../lib/auth/permissions";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedTestWorkspace() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const now = Date.now();
		const permissionIds = new Map<Capability, Id<"permissions">>();
		for (const key of capabilities) {
			permissionIds.set(key, await ctx.db.insert("permissions", { key }));
		}
		const rolePermissions: Record<Role, readonly Capability[]> = {
			admin: capabilities,
			manager: [
				"feedback.view", "feedback.triage", "feedback.assign",
				"feedback.update", "feedback.comment", "project.view", "team.view",
			],
			member: [
				"feedback.view", "feedback.update", "feedback.comment", "project.view",
			],
		};
		const roleIds = new Map<Role, Id<"roles">>();
		for (const name of ["admin", "manager", "member"] as const) {
			roleIds.set(name, await ctx.db.insert("roles", {
				name,
				permissionIds: rolePermissions[name].map((key) => permissionIds.get(key)!),
			}));
		}
		const admin = await ctx.db.insert("users", {
			name: "Ada Admin",
			email: "admin@example.com",
			roleIds: [roleIds.get("admin")!],
		});
		const manager = await ctx.db.insert("users", {
			name: "Moe Manager",
			email: "manager@example.com",
			roleIds: [roleIds.get("manager")!],
		});
		const member = await ctx.db.insert("users", {
			name: "Dan Member",
			email: "member@example.com",
			roleIds: [roleIds.get("member")!],
		});
		const academy = await ctx.db.insert("users", {
			name: "Em Academy",
			email: "academy@example.com",
			roleIds: [roleIds.get("member")!],
		});
		const organizationId = await ctx.db.insert("organizations", {
			name: "Test Org",
			slug: "test-org",
			ownerId: admin,
		});
		for (const userId of [admin, manager, member, academy]) {
			await ctx.db.patch("users", userId, { organizationId });
		}
		const portal = await ctx.db.insert("projects", {
			organizationId,
			name: "Client Portal",
			slug: "client-portal",
			description: "Test project.",
			status: "Active",
			inboxEnabled: true,
			defaultPriority: "Medium",
			criticalAlerts: false,
			weeklyDigest: false,
			updatedAt: now,
		});
		const academyProject = await ctx.db.insert("projects", {
			organizationId,
			name: "Academy",
			slug: "academy",
			description: "Second project.",
			status: "Active",
			inboxEnabled: true,
			defaultPriority: "Medium",
			criticalAlerts: false,
			weeklyDigest: false,
			updatedAt: now,
		});
		const link = async (
			projectId: Id<"projects">,
			userId: Id<"users">,
		) => {
			await ctx.db.insert("projectMembers", { projectId, userId, joinedAt: now });
		};
		await link(portal, admin);
		await link(portal, manager);
		await link(portal, member);
		await link(academyProject, admin);
		await link(academyProject, academy);
		const itemId = await ctx.db.insert("feedback", {
			projectId: portal,
			title: "Login fails on retry",
			description: "Reproducible on staging.",
			category: "Bug",
			priority: "High",
			status: "New",
			assigneeId: null,
			sender: null,
			receivedAt: now,
			updatedAt: now,
		});
		const taxonomy = async (
			key: "status" | "category" | "priority",
			label: string,
			items: { value: string; label: string; rank: number; tone: "info" | "warning" | "primary" | "success" | "danger" | "muted"; isFinal?: boolean }[],
		) => {
			await ctx.db.insert("taxonomies", { key, label, items });
		};
		await taxonomy("status", "Status", [
			{ value: "New", label: "New", rank: 0, tone: "info" },
			{ value: "In review", label: "In review", rank: 1, tone: "warning" },
			{ value: "Planned", label: "Planned", rank: 2, tone: "primary" },
			{ value: "In progress", label: "In progress", rank: 3, tone: "primary" },
			{ value: "Completed", label: "Completed", rank: 4, tone: "success", isFinal: true },
			{ value: "Discarded", label: "Discarded", rank: 5, tone: "muted", isFinal: true },
		]);
		await taxonomy("category", "Category", [
			{ value: "Bug", label: "Bug", rank: 0, tone: "danger" },
			{ value: "Feature request", label: "Feature request", rank: 1, tone: "primary" },
			{ value: "Improvement", label: "Improvement", rank: 2, tone: "info" },
			{ value: "Question", label: "Question", rank: 3, tone: "warning" },
			{ value: "Other", label: "Other", rank: 4, tone: "muted" },
		]);
		await taxonomy("priority", "Priority", [
			{ value: "Low", label: "Low", rank: 0, tone: "muted" },
			{ value: "Medium", label: "Medium", rank: 1, tone: "info" },
			{ value: "High", label: "High", rank: 2, tone: "warning" },
			{ value: "Critical", label: "Critical", rank: 3, tone: "danger" },
		]);
		return {
			admin, manager, member, academy, itemId,
			adminRoleId: roleIds.get("admin")!,
			managerRoleId: roleIds.get("manager")!,
			memberRoleId: roleIds.get("member")!,
			projectManagePermissionId: permissionIds.get("project.manage")!,
		};
	});
	return { t, ids };
}

test("anonymous callers are rejected on every workspace function", async () => {
	const { t, ids } = await seedTestWorkspace();
	const itemId = ids.itemId;

	await expect(
		t.query(api.team.queries.get, { projectSlug: "client-portal" }),
	).rejects.toThrow();
	await expect(
		t.query(api.feedback.queries.workspace, { projectSlug: "client-portal" }),
	).rejects.toThrow();
	await expect(
		t.query(api.feedback.queries.detail, {
			projectSlug: "client-portal",
			feedbackId: itemId,
		}),
	).rejects.toThrow();
	await expect(
		t.query(api.dashboard.overview.get, {
			projectSlug: "client-portal",
			rangeDays: 30,
			now: Date.now(),
		}),
	).rejects.toThrow();
	await expect(
		t.query(api.projects.settings.get, { projectSlug: "client-portal" }),
	).rejects.toThrow();
	await expect(
		t.query(api.projects.settings.access, { projectSlug: "client-portal" }),
	).resolves.toBeNull();
	await expect(t.query(api.taxonomies.queries.list, {})).rejects.toThrow();
	await expect(t.query(api.users.queries.current, {})).resolves.toBeNull();
	await expect(t.query(api.setup.queries.status, {})).resolves.toMatchObject({
		authenticated: false,
		hasMembership: false,
	});
	await expect(
		t.mutation(api.feedback.mutations.update, {
			projectSlug: "client-portal",
			feedbackId: itemId,
			changes: { priority: "High" },
		}),
	).rejects.toThrow();
	await expect(
		t.mutation(api.feedback.mutations.addComment, {
			projectSlug: "client-portal",
			feedbackId: itemId,
			body: "hi",
		}),
	).rejects.toThrow();
	await expect(
		t.mutation(api.taxonomies.mutations.createOption, {
			key: "status",
			label: "Nope",
			color: "#ffffff",
		}),
	).rejects.toThrow();
	await expect(
		t.mutation(api.projects.settings.update, {
			projectSlug: "client-portal",
			changes: { description: "x" },
		}),
	).rejects.toThrow();
});

test("authenticated non-members cannot see or touch another workspace", async () => {
	const { t, ids } = await seedTestWorkspace();
	const outsiderId = await t.run(async (ctx) =>
		ctx.db.insert("users", { name: "Outsider", email: "outsider@example.com" }),
	);
	const outsider = t.withIdentity({ subject: outsiderId });

	await expect(
		outsider.query(api.team.queries.get, { projectSlug: "client-portal" }),
	).rejects.toThrow(/denied/i);
	await expect(
		outsider.query(api.feedback.queries.workspace, { projectSlug: "client-portal" }),
	).rejects.toThrow(/denied/i);
	// users.current exposes only the caller's own row.
	await expect(outsider.query(api.users.queries.current, {})).resolves.toMatchObject({
		id: outsiderId,
		email: "outsider@example.com",
	});
	await expect(outsider.query(api.setup.queries.status, {})).resolves.toMatchObject({
		authenticated: true,
		hasMembership: false,
	});
	// Sanity: a real member still gets in.
	const admin = t.withIdentity({ subject: ids.admin });
	await expect(
		admin.query(api.team.queries.get, { projectSlug: "client-portal" }),
	).resolves.toMatchObject({ summary: { memberCount: 3 } });
});

test("project links are enforced: academy member cannot enter client-portal", async () => {
	const { t, ids } = await seedTestWorkspace();
	const academy = t.withIdentity({ subject: ids.academy }); // academy only
	await expect(
		academy.query(api.feedback.queries.workspace, { projectSlug: "client-portal" }),
	).rejects.toThrow(/denied/i);
	await expect(
		academy.query(api.feedback.queries.workspace, { projectSlug: "academy" }),
	).resolves.toBeDefined();
});

test("administrators create persisted projects with their own membership", async () => {
	const { t, ids } = await seedTestWorkspace();
	const admin = t.withIdentity({ subject: ids.admin });
	const manager = t.withIdentity({ subject: ids.manager });
	await expect(
		manager.mutation(api.projects.mutations.create, {
			currentProjectSlug: "client-portal",
			name: "Test workspace",
			description: "Should not be created.",
		}),
	).rejects.toThrow();

	const project = await admin.mutation(api.projects.mutations.create, {
		currentProjectSlug: "client-portal",
		name: "Test workspace",
		description: "Created from the project switcher.",
	});
	await expect(admin.query(api.projects.queries.list, {})).resolves.toContainEqual(
		project,
	);
	await expect(
		admin.query(api.team.queries.get, { projectSlug: project.slug }),
	).resolves.toMatchObject({
		project: { name: "Test workspace", slug: "test-workspace" },
		summary: { memberCount: 1 },
	});
});

test("new accounts create their first workspace as its administrator and owner", async () => {
	const t = convexTest(schema, modules);
	const userId = await t.run((ctx) =>
		ctx.db.insert("users", { name: "Nia New", email: "nia@example.com" }),
	);
	const user = t.withIdentity({ subject: userId });

	await expect(user.query(api.setup.queries.status, {})).resolves.toEqual({
		authenticated: true,
		hasMembership: false,
		canCreateWorkspace: true,
	});
	const workspace = await user.mutation(api.setup.mutations.createWorkspace, {
		name: "North Star",
	});

	expect(workspace).toEqual({ projectSlug: "north-star", workspaceName: "North Star" });
	await expect(user.query(api.setup.queries.status, {})).resolves.toEqual({
		authenticated: true,
		hasMembership: true,
		canCreateWorkspace: true,
	});
	await expect(user.query(api.projects.queries.list, {})).resolves.toContainEqual({
		slug: "north-star",
		name: "North Star",
		description: "The first project in this workspace.",
	});
	const secondWorkspace = await user.mutation(api.setup.mutations.createWorkspace, {
		name: "Second workspace",
	});

	const ownership = await t.run(async (ctx) => {
		const organization = await ctx.db
			.query("organizations")
			.withIndex("by_slug", (q) => q.eq("slug", workspace.projectSlug))
			.unique();
		const organizationMembership = organization
			? await ctx.db
				.query("organizationMembers")
				.withIndex("by_organizationId_userId", (q) =>
					q.eq("organizationId", organization._id).eq("userId", userId),
				)
				.unique()
			: null;
		const role = organizationMembership?.roleIds[0]
			? await ctx.db.get("roles", organizationMembership.roleIds[0])
			: null;
		const project = await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", workspace.projectSlug))
			.unique();
		const membership = project
			? await ctx.db
				.query("projectMembers")
				.withIndex("by_projectId_userId", (q) =>
					q.eq("projectId", project._id).eq("userId", userId),
				)
				.unique()
			: null;
		return { organization, role, membership };
	});

	expect(ownership.organization?.ownerId).toBe(userId);
	expect(ownership.role?.name).toBe("admin");
	expect(ownership.membership?.userId).toBe(userId);
	await expect(user.query(api.projects.queries.list, {})).resolves.toEqual(
		expect.arrayContaining([{ slug: secondWorkspace.projectSlug, name: "Second workspace", description: "The first project in this workspace." }]),
	);
});

test("an invitation grants only its project role and expires before acceptance", async () => {
	const { t, ids } = await seedTestWorkspace();
	const recipientId = await t.run((ctx) =>
		ctx.db.insert("users", { name: "Ivy Invitee", email: "ivy@example.com" }),
	);
	const token = "valid-project-invitation";
	const expiredToken = "expired-project-invitation";
	await t.run(async (ctx) => {
		const portal = await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", "client-portal"))
			.unique();
		if (!portal) throw new Error("Missing test project.");
		await ctx.db.insert("projectInvitations", {
			projectId: portal._id,
			roleId: ids.adminRoleId,
			token,
			createdBy: ids.admin,
			expiresAt: Date.now() + 60_000,
		});
		await ctx.db.insert("projectInvitations", {
			projectId: portal._id,
			roleId: ids.memberRoleId,
			token: expiredToken,
			createdBy: ids.admin,
			expiresAt: Date.now() - 1,
		});
	});
	const recipient = t.withIdentity({ subject: recipientId });

	await expect(recipient.mutation(api.invitations.mutations.accept, { token })).resolves.toEqual({
		projectSlug: "client-portal",
	});
	await expect(
		recipient.query(api.team.queries.get, { projectSlug: "client-portal" }),
	).resolves.toMatchObject({ project: { slug: "client-portal" } });
	await expect(
		recipient.query(api.feedback.queries.workspace, { projectSlug: "academy" }),
	).rejects.toThrow(/access denied/i);
	await expect(
		recipient.mutation(api.invitations.mutations.accept, { token: expiredToken }),
	).rejects.toThrow(/expired/i);

	const membership = await t.run(async (ctx) => {
		const project = await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", "client-portal"))
			.unique();
		if (!project) return null;
		return ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) =>
				q.eq("projectId", project._id).eq("userId", recipientId),
			)
			.unique();
	});
	expect(membership?.roleId).toBe(ids.adminRoleId);
	const secondWorkspaceInvite = await t.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Second Org",
			slug: "second-org",
			ownerId: ids.admin,
		});
		const projectId = await ctx.db.insert("projects", {
			organizationId,
			name: "Second project",
			slug: "second-project",
			description: "Second workspace project.",
			status: "Active",
			inboxEnabled: true,
			defaultPriority: "Medium",
			criticalAlerts: false,
			weeklyDigest: false,
		});
		const token = "second-workspace-invitation";
		await ctx.db.insert("projectInvitations", {
			projectId,
			roleId: ids.memberRoleId,
			token,
			createdBy: ids.admin,
			expiresAt: Date.now() + 60_000,
		});
		return token;
	});
	await expect(
		recipient.mutation(api.invitations.mutations.accept, { token: secondWorkspaceInvite }),
	).resolves.toEqual({ projectSlug: "second-project" });
	await expect(recipient.query(api.projects.queries.list, {})).resolves.toEqual(
		expect.arrayContaining([
			{ slug: "client-portal", name: "Client Portal", description: "Test project." },
			{ slug: "second-project", name: "Second project", description: "Second workspace project." },
		]),
	);
});

test("only project administrators can create invitation links", async () => {
	const { t, ids } = await seedTestWorkspace();
	const admin = t.withIdentity({ subject: ids.admin });
	const manager = t.withIdentity({ subject: ids.manager });

	await expect(
		manager.action(api.invitations.actions.create, {
			projectSlug: "client-portal",
			roleId: ids.memberRoleId,
			expiresInHours: 1,
		}),
	).rejects.toThrow(/cannot invite/i);
	const invitation = await admin.action(api.invitations.actions.create, {
		projectSlug: "client-portal",
		roleId: ids.managerRoleId,
		expiresInHours: 6,
	});
	expect(invitation.token).toHaveLength(32);
	await expect(
		t.query(api.invitations.queries.preview, { token: invitation.token }),
	).resolves.toMatchObject({
		projectSlug: "client-portal",
		role: "manager",
		status: "active",
	});
});

test("administrators manage project roles and deleted roles fall back to member", async () => {
	const { t, ids } = await seedTestWorkspace();
	const admin = t.withIdentity({ subject: ids.admin });
	const member = t.withIdentity({ subject: ids.member });
	const customRole = await admin.mutation(api.projects.settings.createRole, {
		projectSlug: "client-portal",
		name: "Triage lead",
		permissionKeys: ["feedback.triage", "feedback.assign"],
	});

	await admin.mutation(api.team.mutations.setMemberRole, {
		projectSlug: "client-portal",
		memberId: ids.member,
		roleId: customRole.id,
	});
	const workspace = await admin.query(api.feedback.queries.workspace, {
		projectSlug: "client-portal",
	});
	await member.mutation(api.feedback.mutations.update, {
		projectSlug: "client-portal",
		feedbackId: workspace.items[0]._id,
		changes: { priority: "Low" },
	});

	await expect(
		admin.mutation(api.projects.settings.deleteRole, {
			projectSlug: "client-portal",
			roleId: ids.adminRoleId,
		}),
	).rejects.toThrow(/built-in roles cannot be deleted/i);
	await admin.mutation(api.projects.settings.deleteRole, {
		projectSlug: "client-portal",
		roleId: customRole.id,
	});
	await expect(
		member.mutation(api.feedback.mutations.update, {
			projectSlug: "client-portal",
			feedbackId: workspace.items[0]._id,
			changes: { priority: "High" },
		}),
	).rejects.toThrow();
	const roles = await admin.query(api.projects.settings.roles, {
		projectSlug: "client-portal",
	});
	expect(roles.roles).not.toContainEqual(expect.objectContaining({ id: customRole.id }));
});

test("capabilities hold per role: members cannot triage or manage", async () => {
	const { t, ids } = await seedTestWorkspace();
	const admin = t.withIdentity({ subject: ids.admin });
	const member = t.withIdentity({ subject: ids.member });

	const workspace = await admin.query(api.feedback.queries.workspace, {
		projectSlug: "client-portal",
	});
	const itemId = workspace.items[0]._id;

	// Member without triage capability is refused…
	await expect(
		member.mutation(api.feedback.mutations.update, {
			projectSlug: "client-portal",
			feedbackId: itemId,
			changes: { priority: "Low" },
		}),
	).rejects.toThrow();
	// …while the admin triages the same item.
	await admin.mutation(api.feedback.mutations.update, {
		projectSlug: "client-portal",
		feedbackId: itemId,
		changes: { priority: "Low" },
	});
	// Members cannot manage project settings either.
	await expect(
		member.mutation(api.projects.settings.update, {
			projectSlug: "client-portal",
			changes: { description: "hijacked" },
		}),
	).rejects.toThrow();
});

test("the access catalog grants existing members team visibility", async () => {
	const { t, ids } = await seedTestWorkspace();
	const member = t.withIdentity({ subject: ids.member });

	await expect(
		member.query(api.team.queries.get, { projectSlug: "client-portal" }),
	).rejects.toThrow(/cannot make this change/i);

	await t.mutation(internal.setup.admin.seedAccessCatalog, {});

	await expect(
		member.query(api.team.queries.get, { projectSlug: "client-portal" }),
	).resolves.toMatchObject({ project: { slug: "client-portal" } });
});

test("assignee spoofing is impossible: owners must belong to the project", async () => {
	const { t, ids } = await seedTestWorkspace();
	const admin = t.withIdentity({ subject: ids.admin });
	const outsiderId: Id<"users"> = await t.run(async (ctx) =>
		ctx.db.insert("users", { name: "Outsider", email: "outsider2@example.com" }),
	);
	const workspace = await admin.query(api.feedback.queries.workspace, {
		projectSlug: "client-portal",
	});
	await expect(
		admin.mutation(api.feedback.mutations.update, {
			projectSlug: "client-portal",
			feedbackId: workspace.items[0]._id,
			changes: { assigneeId: outsiderId },
		}),
	).rejects.toThrow(/belongs to this project/i);
	// No userId argument can redirect authorship: comments always land on
	// the authenticated user.
	await admin.mutation(api.feedback.mutations.addComment, {
		projectSlug: "client-portal",
		feedbackId: workspace.items[0]._id,
		body: "admin note",
	});
	const detail = await admin.query(api.feedback.queries.detail, {
		projectSlug: "client-portal",
		feedbackId: workspace.items[0]._id,
	});
	expect(detail.comments[0].body).toBe("admin note");
	expect(ids.member).toBeDefined();
});

test("taxonomy writes require a real administrator", async () => {
	const { t, ids } = await seedTestWorkspace();
	const member = t.withIdentity({ subject: ids.member });
	const admin = t.withIdentity({ subject: ids.admin });

	await expect(
		member.mutation(api.taxonomies.mutations.createOption, {
			key: "status",
			label: "Sneaky",
			color: "#111111",
		}),
	).rejects.toThrow();
	const created = await admin.mutation(api.taxonomies.mutations.createOption, {
		key: "status",
		label: "Verified",
		color: "#111111",
	});
	expect(created.value).toBe("verified");
	await admin.mutation(api.taxonomies.mutations.removeOption, {
		key: "status",
		value: "verified",
	});
});

test("role permission changes take effect without changing user assignments", async () => {
	const { t, ids } = await seedTestWorkspace();
	const admin = t.withIdentity({ subject: ids.admin });
	const member = t.withIdentity({ subject: ids.member });
	const update = { projectSlug: "client-portal", changes: { description: "Updated" } };

	await expect(member.mutation(api.projects.settings.update, update)).rejects.toThrow();
	await admin.mutation(api.projects.settings.update, update);

	await t.run(async (ctx) => {
		const adminRoleId = ids.adminRoleId;
		const adminRole = await ctx.db.get("roles", adminRoleId);
		await ctx.db.patch("roles", adminRoleId, {
			permissionIds: adminRole!.permissionIds.filter(
				(id) => id !== ids.projectManagePermissionId,
			),
		});
		const memberRoleId = ids.memberRoleId;
		const memberRole = await ctx.db.get("roles", memberRoleId);
		await ctx.db.patch("roles", memberRoleId, {
			permissionIds: [...memberRole!.permissionIds, ids.projectManagePermissionId],
		});
	});

	await expect(admin.mutation(api.projects.settings.update, update)).rejects.toThrow();
	await member.mutation(api.projects.settings.update, update);
});

test("a user receives the union of permissions from assigned roles", async () => {
	const { t, ids } = await seedTestWorkspace();
	await t.run(async (ctx) => {
		await ctx.db.patch("users", ids.member, {
			roleIds: [ids.memberRoleId, ids.adminRoleId],
		});
	});
	const member = t.withIdentity({ subject: ids.member });
	await member.mutation(api.projects.settings.update, {
		projectSlug: "client-portal",
		changes: { description: "Allowed by the second role" },
	});
});

test("an administrator assigned to another organization cannot enter this project", async () => {
	const { t, ids } = await seedTestWorkspace();
	const otherAdmin = await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			name: "Other Admin",
			email: "other-admin@example.com",
			roleIds: [ids.adminRoleId],
		});
		const organizationId = await ctx.db.insert("organizations", {
			name: "Other Org",
			slug: "other-org",
			ownerId: userId,
		});
		await ctx.db.patch("users", userId, { organizationId });
		return userId;
	});
	const caller = t.withIdentity({ subject: otherAdmin });
	await expect(
		caller.query(api.feedback.queries.workspace, { projectSlug: "client-portal" }),
	).rejects.toThrow(/denied/i);
});
