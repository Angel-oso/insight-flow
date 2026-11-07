import { newConvexTest } from "../../test/convex-test";
import { api } from "../_generated/api";
import { expect, test } from "vitest";
import { slugify } from "../lib/slugs";

const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./setup/"), load])),
};
const { createWorkspace } = api.setup.mutations;

async function newUser(t: ReturnType<typeof newConvexTest>, name: string) {
	const userId = await t.run((ctx) => ctx.db.insert("users", { name }));
	return { userId, client: t.withIdentity({ subject: userId }) };
}

test("slugify normalizes accents, punctuation and length", () => {
	expect(slugify("  Café Ünïcode!! ")).toBe("cafe-unicode");
	expect(slugify("!!!")).toBe("");
	expect(slugify("a".repeat(100))).toHaveLength(48);
});

test("slug collisions across organizations get a random suffix instead of a leaking error", async () => {
	const t = newConvexTest(modules);
	const first = await newUser(t, "First");
	const second = await newUser(t, "Second");
	const a = await first.client.mutation(createWorkspace, { name: "Acme", projectName: "Website" });
	expect(a).toEqual({ projectSlug: "website", workspaceName: "Acme" });
	expect((await first.client.query(api.organizations.queries.mine, {}))[0].slug).toBe("acme");

	const b = await second.client.mutation(createWorkspace, { name: "Acme", projectName: "Website" });
	expect(b.projectSlug).toMatch(/^website-[a-z0-9]{4}$/);
	expect(b.workspaceName).toBe("Acme");
	const [org] = await second.client.query(api.organizations.queries.mine, {});
	expect(org.slug).toMatch(/^acme-[a-z0-9]{4}$/);

	// The second tenant's project lives under the returned slug.
	const created = await t.run((ctx) => ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", b.projectSlug)).unique());
	expect(created?.organizationId).toBe(org.id);

	// Projects created later in another workspace also get suffixed slugs.
	const project = await second.client.mutation(api.projects.mutations.create, { organizationId: org.id, name: "Website!", description: "" });
	expect(project.slug).toMatch(/^website-[a-z0-9]{4}$/);
	expect(project.slug).not.toBe(b.projectSlug);
});

test("project names stay unique within one workspace (case-insensitive)", async () => {
	const t = newConvexTest(modules);
	const { client } = await newUser(t, "Owner");
	await client.mutation(createWorkspace, { name: "Studio", projectName: "Portal" });
	const [org] = await client.query(api.organizations.queries.mine, {});
	await expect(client.mutation(api.projects.mutations.create, { organizationId: org.id, name: " portal ", description: "" })).rejects.toThrow(/already has a project with this name/i);
});

test("createWorkspace is rate limited per user", async () => {
	const t = newConvexTest(modules);
	const { client } = await newUser(t, "Busy");
	for (let i = 0; i < 3; i += 1) await client.mutation(createWorkspace, { name: `Org ${i}`, projectName: `Project ${i}` });
	await expect(client.mutation(createWorkspace, { name: "Org 4", projectName: "Project 4" })).rejects.toThrow(/several workspaces recently.*try again in/i);
	expect(await t.run((ctx) => ctx.db.query("organizations").collect())).toHaveLength(3);

	// Another user is unaffected.
	const other = await newUser(t, "Other");
	await other.client.mutation(createWorkspace, { name: "Fresh", projectName: "Fresh" });
});

test("a user can own at most 10 organizations", async () => {
	const t = newConvexTest(modules);
	const { userId, client } = await newUser(t, "Collector");
	await t.run(async (ctx) => {
		for (let i = 0; i < 10; i += 1) {
			const organizationId = await ctx.db.insert("organizations", { name: `Org ${i}`, slug: `org-${i}`, ownerId: userId });
			await ctx.db.insert("organizationMembers", { organizationId, userId, roleIds: [] });
		}
	});
	await expect(client.mutation(createWorkspace, { name: "One more", projectName: "One more" })).rejects.toThrow(/up to 10 workspaces/i);
});

test("project creation is rate limited per user", async () => {
	const t = newConvexTest(modules);
	const { client } = await newUser(t, "Builder");
	await client.mutation(createWorkspace, { name: "Studio", projectName: "Portal" });
	const [org] = await client.query(api.organizations.queries.mine, {});
	for (let i = 0; i < 10; i += 1) await client.mutation(api.projects.mutations.create, { organizationId: org.id, name: `Project ${i}`, description: "" });
	await expect(client.mutation(api.projects.mutations.create, { organizationId: org.id, name: "Project 11", description: "" })).rejects.toThrow(/several projects recently/i);
});
