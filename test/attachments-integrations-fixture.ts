import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { insertFeedbackRow } from "../convex/feedback/store";
import { newConvexTest } from "./convex-test";

type Modules = Record<string, () => Promise<unknown>>;

/**
 * Shared fixture for attachment and integration tests: an owner (admin), a
 * member (feedback.update, no project.manage), a viewer (feedback.view
 * only, via a custom project role) and an outsider in another workspace.
 */
export async function workspaceFixture(modules: Modules) {
	const t = newConvexTest(modules);
	const ownerId = await t.run((ctx) => ctx.db.insert("users", { name: "Owner", email: "owner@example.com" }));
	const owner = t.withIdentity({ subject: ownerId });
	const { projectSlug } = await owner.mutation(api.setup.mutations.createWorkspace, { name: "Acme", projectName: "App" });
	const ids = await t.run(async (ctx) => {
		const project = (await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", projectSlug)).unique())!;
		const memberRole = (await ctx.db.query("roles").withIndex("by_name", (q) => q.eq("name", "member")).first())!._id;
		const viewPermissions: Id<"permissions">[] = [];
		for (const key of ["feedback.view", "project.view"] as const)
			viewPermissions.push((await ctx.db.query("permissions").withIndex("by_key", (q) => q.eq("key", key)).unique())!._id);
		const viewerRole = await ctx.db.insert("roles", { name: "viewer", permissionIds: viewPermissions, projectId: project._id });
		const add = async (name: string, roleId?: Id<"roles">) => {
			const userId = await ctx.db.insert("users", { name, email: `${name.toLowerCase()}@example.com` });
			await ctx.db.insert("organizationMembers", { organizationId: project.organizationId, userId, roleIds: [memberRole] });
			await ctx.db.insert("projectMembers", { projectId: project._id, userId, roleId, joinedAt: Date.now() });
			return userId;
		};
		const memberId = await add("Mia");
		const viewerId = await add("Vic", viewerRole);
		const outsiderId = await ctx.db.insert("users", { name: "Oz", email: "oz@example.com" });
		const now = Date.now();
		const feedbackId = await insertFeedbackRow(ctx, {
			projectId: project._id,
			title: "Checkout crash",
			description: "The checkout page crashes on submit.",
			category: "Bug",
			priority: "High",
			status: "New",
			assigneeId: null,
			sender: { name: "Sam Sender", email: "sam.sender@example.com" },
			receivedAt: now,
			updatedAt: now,
		});
		return { projectId: project._id, organizationId: project.organizationId, memberId, viewerId, outsiderId, feedbackId };
	});
	return {
		t,
		projectSlug,
		owner,
		member: t.withIdentity({ subject: ids.memberId }),
		viewer: t.withIdentity({ subject: ids.viewerId }),
		outsider: t.withIdentity({ subject: ids.outsiderId }),
		...ids,
	};
}
