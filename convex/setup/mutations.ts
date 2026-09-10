import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { env, mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * DEV ONLY. Grants the caller admin membership in the seeded demo
 * organization (plus the demo owner's project links) so a freshly
 * signed-in account can explore. Hard-gated by DEMO_ENABLED: with the
 * flag unset this always throws, which also makes it a safe negative
 * test for the security suite.
 */
export const claimDemoAccess = mutation({
	args: {},
	returns: v.object({ membershipId: v.id("memberships") }),
	handler: async (ctx) => {
		if (env.DEMO_ENABLED !== "true")
			throw new ConvexError("Demo access is disabled.");
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Sign in to claim demo access.");
		const userIdTyped = userId as Id<"users">;
		const organization = await ctx.db
			.query("organizations")
			.withIndex("by_slug", (q) => q.eq("slug", "acme-studio-demo"))
			.unique();
		if (!organization)
			throw new ConvexError("Demo workspace not found. Run the seed first.");
		const existing = await ctx.db
			.query("memberships")
			.withIndex("by_organizationId_userId", (q) =>
				q.eq("organizationId", organization._id).eq("userId", userIdTyped),
			)
			.unique();
		if (existing) return { membershipId: existing._id };
		const membershipId = await ctx.db.insert("memberships", {
			organizationId: organization._id,
			userId: userIdTyped,
			role: "admin",
			joinedAt: Date.now(),
		});
		// Mirror the demo owner's project links so every demo project opens.
		const ownerLink = await ctx.db
			.query("memberships")
			.withIndex("by_organizationId_userId", (q) =>
				q
					.eq("organizationId", organization._id)
					.eq("userId", organization.ownerId),
			)
			.unique();
		if (ownerLink) {
			const links = await ctx.db
				.query("projectMembers")
				.withIndex("by_membershipId", (q) =>
					q.eq("membershipId", ownerLink._id),
				)
				.take(51);
			for (const link of links) {
				await ctx.db.insert("projectMembers", {
					projectId: link.projectId,
					membershipId,
				});
			}
		}
		return { membershipId };
	},
});
