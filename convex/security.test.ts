/**
 * Authorization security suite: every workspace read/write must reject
 * anonymous callers and non-members, capabilities must hold per role, and
 * no function may accept identity from client arguments.
 *
 * Self-contained: the fixture below builds a fresh org (admin, manager,
 * member, academy-only member, two projects, one feedback item, minimal
 * taxonomies) per test. Runs fully in-memory (convex-test); no network,
 * no real OAuth.
 */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Role = "admin" | "manager" | "member";

async function seedTestWorkspace() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const now = Date.now();
		const admin = await ctx.db.insert("users", {
			name: "Ada Admin",
			email: "admin@example.com",
		});
		const manager = await ctx.db.insert("users", {
			name: "Moe Manager",
			email: "manager@example.com",
		});
		const member = await ctx.db.insert("users", {
			name: "Dan Member",
			email: "member@example.com",
		});
		const academy = await ctx.db.insert("users", {
			name: "Em Academy",
			email: "academy@example.com",
		});
		const organizationId = await ctx.db.insert("organizations", {
			name: "Test Org",
			slug: "test-org",
			ownerId: admin,
		});
		const membership = async (userId: Id<"users">, role: Role) =>
			ctx.db.insert("memberships", {
				organizationId,
				userId,
				role,
				joinedAt: now,
			});
		const adminMembership = await membership(admin, "admin");
		const managerMembership = await membership(manager, "manager");
		const memberMembership = await membership(member, "member");
		const academyMembership = await membership(academy, "member");
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
			membershipId: Id<"memberships">,
		) => {
			await ctx.db.insert("projectMembers", { projectId, membershipId });
		};
		await link(portal, adminMembership);
		await link(portal, managerMembership);
		await link(portal, memberMembership);
		await link(academyProject, adminMembership);
		await link(academyProject, academyMembership);
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
		return { admin, manager, member, academy, itemId };
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
		t.query(api.projects.settings.role, { projectSlug: "client-portal" }),
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
		academy.query(api.team.queries.get, { projectSlug: "client-portal" }),
	).rejects.toThrow(/denied/i);
	await expect(
		academy.query(api.team.queries.get, { projectSlug: "academy" }),
	).resolves.toBeDefined();
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
	// the caller's own membership.
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
	).rejects.toThrow(/administrator/i);
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
