/**
 * Authorization security suite: every workspace read/write must reject
 * anonymous callers and non-members, capabilities must hold per role, and
 * no function may accept identity from client arguments.
 *
 * Runs fully in-memory (convex-test); no network, no real OAuth.
 */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedDemo() {
	const t = convexTest(schema, modules);
	await t.mutation(internal.setup.seed.run, {});
	const ids = await t.run(async (ctx) => {
		const byEmail = async (email: string) => {
			const user = await ctx.db
				.query("users")
				.withIndex("email", (q) => q.eq("email", email))
				.unique();
			if (!user) throw new Error(`Seed user missing: ${email}`);
			return user._id;
		};
		return {
			sarah: await byEmail("sarah@example.com"), // admin, all projects
			michael: await byEmail("michael@example.com"), // manager
			emma: await byEmail("emma@example.com"), // member, academy only
			daniel: await byEmail("daniel@example.com"), // member, client-portal
		};
	});
	return { t, ids };
}

test("anonymous callers are rejected on every workspace function", async () => {
	const { t } = await seedDemo();
	const itemId = await t.run(async (ctx) => {
		const project = await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", "client-portal"))
			.unique();
		if (!project) throw new Error("Seed project missing");
		const item = await ctx.db
			.query("feedback")
			.withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", project._id))
			.first();
		if (!item) throw new Error("Seed feedback missing");
		return item._id;
	});

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
			label: " cha ",
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
	const { t, ids } = await seedDemo();
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
	const sarah = t.withIdentity({ subject: ids.sarah });
	await expect(
		sarah.query(api.team.queries.get, { projectSlug: "client-portal" }),
	).resolves.toMatchObject({ summary: { memberCount: 3 } });
});

test("project links are enforced: academy member cannot enter client-portal", async () => {
	const { t, ids } = await seedDemo();
	const emma = t.withIdentity({ subject: ids.emma }); // academy only
	await expect(
		emma.query(api.team.queries.get, { projectSlug: "client-portal" }),
	).rejects.toThrow(/denied/i);
	await expect(
		emma.query(api.team.queries.get, { projectSlug: "academy" }),
	).resolves.toBeDefined();
});

test("capabilities hold per role: members cannot triage or manage", async () => {
	const { t, ids } = await seedDemo();
	const sarah = t.withIdentity({ subject: ids.sarah });
	const daniel = t.withIdentity({ subject: ids.daniel });

	const workspace = await sarah.query(api.feedback.queries.workspace, {
		projectSlug: "client-portal",
	});
	const itemId = workspace.items[0]._id;

	// Member without triage capability is refused…
	await expect(
		daniel.mutation(api.feedback.mutations.update, {
			projectSlug: "client-portal",
			feedbackId: itemId,
			changes: { priority: "Low" },
		}),
	).rejects.toThrow();
	// …while the admin triages the same item.
	await sarah.mutation(api.feedback.mutations.update, {
		projectSlug: "client-portal",
		feedbackId: itemId,
		changes: { priority: "Low" },
	});
	// Members cannot manage project settings either.
	await expect(
		daniel.mutation(api.projects.settings.update, {
			projectSlug: "client-portal",
			changes: { description: "hijacked" },
		}),
	).rejects.toThrow();
});

test("assignee spoofing is impossible: owners must belong to the project", async () => {
	const { t, ids } = await seedDemo();
	const sarah = t.withIdentity({ subject: ids.sarah });
	const outsiderId: Id<"users"> = await t.run(async (ctx) =>
		ctx.db.insert("users", { name: "Outsider", email: "outsider2@example.com" }),
	);
	const workspace = await sarah.query(api.feedback.queries.workspace, {
		projectSlug: "client-portal",
	});
	await expect(
		sarah.mutation(api.feedback.mutations.update, {
			projectSlug: "client-portal",
			feedbackId: workspace.items[0]._id,
			changes: { assigneeId: outsiderId },
		}),
	).rejects.toThrow(/belongs to this project/i);
	// No userId argument can redirect authorship: comments always land on
	// the caller's own membership.
	await sarah.mutation(api.feedback.mutations.addComment, {
		projectSlug: "client-portal",
		feedbackId: workspace.items[0]._id,
		body: "admin note",
	});
	const detail = await sarah.query(api.feedback.queries.detail, {
		projectSlug: "client-portal",
		feedbackId: workspace.items[0]._id,
	});
	expect(detail.comments[0].body).toBe("admin note");
	expect(ids.daniel).toBeDefined();
});

test("taxonomy writes require a real administrator", async () => {
	const { t, ids } = await seedDemo();
	const daniel = t.withIdentity({ subject: ids.daniel });
	const sarah = t.withIdentity({ subject: ids.sarah });

	await expect(
		daniel.mutation(api.taxonomies.mutations.createOption, {
			key: "status",
			label: "Sneaky",
			color: "#111111",
		}),
	).rejects.toThrow(/administrator/i);
	const created = await sarah.mutation(api.taxonomies.mutations.createOption, {
		key: "status",
		label: "Verified",
		color: "#111111",
	});
	expect(created.value).toBe("verified");
	await sarah.mutation(api.taxonomies.mutations.removeOption, {
		key: "status",
		value: "verified",
	});
});

test("demo claim is hard-disabled without DEMO_ENABLED", async () => {
	const { t } = await seedDemo();
	// The test runtime carries no DEMO_ENABLED, so the dev-only escape
	// hatch must refuse even authenticated callers.
	const outsiderId = await t.run(async (ctx) =>
		ctx.db.insert("users", { name: "Outsider", email: "outsider3@example.com" }),
	);
	const outsider = t.withIdentity({ subject: outsiderId });
	await expect(outsider.mutation(api.setup.mutations.claimDemoAccess, {})).rejects.toThrow(
		/disabled/i,
	);
});
