import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./taxonomies/"), load])),
};

test("taxonomy removal refuses to truncate organizations with more than 100 projects", async () => {
	const t = convexTest(schema, modules);
	const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Owner" }));
	const owner = t.withIdentity({ subject: userId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, { name: "Bounded", projectName: "Bounded" });
	const fields = await t.run(async (ctx) => {
		const project = await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique();
		const { _id, _creationTime, ...fields } = project!;
		void _id; void _creationTime;
		for (let i = 1; i < 100; i += 1) {
			await ctx.db.insert("projects", { ...fields, slug: `bounded-${i}` });
		}
		return fields;
	});
	const option = await owner.mutation(api.taxonomies.mutations.createOption, {
		projectSlug, key: "category", label: "Removable", color: "#111111",
	});
	await owner.mutation(api.taxonomies.mutations.removeOption, { projectSlug, key: "category", value: option.value });
	const blocked = await owner.mutation(api.taxonomies.mutations.createOption, {
		projectSlug, key: "category", label: "Blocked", color: "#111111",
	});
	await t.run((ctx) => ctx.db.insert("projects", { ...fields, slug: "bounded-101" }));
	const before = await t.run((ctx) => ctx.db.query("taxonomies").collect());
	await expect(owner.mutation(api.taxonomies.mutations.removeOption, {
		projectSlug, key: "category", value: blocked.value,
	})).rejects.toThrow(/up to 100 projects/i);
	expect(await t.run((ctx) => ctx.db.query("taxonomies").collect())).toEqual(before);
});

test("missing organization taxonomies ignore legacy docs and materialize on first write", async () => {
	const t = convexTest(schema, modules);
	const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Owner" }));
	const owner = t.withIdentity({ subject: userId });
	await owner.mutation(api.setup.mutations.createWorkspace, { name: "Original", projectName: "Original" });
	await t.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", { name: "Uninitialized", slug: "uninitialized", ownerId: userId });
		const role = await ctx.db.query("roles").withIndex("by_name", (q) => q.eq("name", "admin")).unique();
		const projectId = await ctx.db.insert("projects", {
			organizationId, name: "Uninitialized", slug: "uninitialized", description: "",
			status: "Active", inboxEnabled: true, defaultPriority: "Medium", criticalAlerts: false, weeklyDigest: false,
		});
		await ctx.db.insert("organizationMembers", { organizationId, userId, roleIds: [role!._id] });
		await ctx.db.insert("projectMembers", { projectId, userId, roleId: role!._id, joinedAt: Date.now() });
		await ctx.db.insert("taxonomies", {
			key: "status", label: "Legacy", items: [{ value: "Legacy", label: "Legacy", rank: 0, tone: "muted" }],
		});
	});
	const projectSlug = "uninitialized";
	const before = await owner.query(api.taxonomies.queries.list, { projectSlug });
	expect(before.statuses[0].value).toBe("New");
	expect(before.categories[0].value).toBe("Bug");
	expect(before.priorities[0].value).toBe("Low");
	await owner.mutation(api.taxonomies.mutations.updateOption, { projectSlug, key: "status", value: "New", label: "Incoming" });
	const after = await owner.query(api.taxonomies.queries.list, { projectSlug });
	expect(after.statuses[0].label).toBe("Incoming");
	await t.run(async (ctx) => {
		const project = await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique();
		const docs = await ctx.db.query("taxonomies").collect();
		expect(docs.filter((doc) => doc.organizationId === project?.organizationId)).toHaveLength(3);
		expect(docs.find((doc) => doc.organizationId === undefined)?.items[0].label).toBe("Legacy");
	});
});

test("a priority used as a project's default cannot be removed", async () => {
	const t = convexTest(schema, modules);
	const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Owner" }));
	const owner = t.withIdentity({ subject: userId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, { name: "Defaults", projectName: "Defaults" });
	const option = await owner.mutation(api.taxonomies.mutations.createOption, {
		projectSlug, key: "priority", label: "Someday", color: "#222222",
	});
	await owner.mutation(api.projects.settings.update, {
		projectSlug, changes: { defaultPriority: option.value },
	});
	const before = await t.run((ctx) => ctx.db.query("taxonomies").collect());
	await expect(owner.mutation(api.taxonomies.mutations.removeOption, {
		projectSlug, key: "priority", value: option.value,
	})).rejects.toThrow("This priority is a project's default and cannot be removed.");
	expect(await t.run((ctx) => ctx.db.query("taxonomies").collect())).toEqual(before);
});
