import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { hasCapability } from "../../lib/auth/permissions";
import { resolveProjectAccess } from "../access/roles";
import { preferenceRow, wants, type NotificationKind } from "./preferences";
import { isSuppressed } from "./suppression";

/** Upper bound on project links read per notification. */
export const MAX_NOTIFIED_MEMBERS = 200;

export type Recipient = { userId: Id<"users">; email: string; name: string | null };

/**
 * Members of `project` who can triage feedback, have a verified email, kept
 * `kind` on in their own notification preferences and whose address has
 * not bounced or complained. Unverified addresses are skipped so a
 * notification never goes to an address its account holder hasn't proven
 * they own.
 */
export async function triageRecipients(
	ctx: QueryCtx,
	project: Doc<"projects">,
	kind: NotificationKind,
): Promise<Recipient[]> {
	const links = await ctx.db
		.query("projectMembers")
		.withIndex("by_projectId_userId", (q) => q.eq("projectId", project._id))
		.take(MAX_NOTIFIED_MEMBERS);
	const recipients: Recipient[] = [];
	const seen = new Set<string>();
	for (const link of links) {
		const access = await resolveProjectAccess(ctx, link.userId, project._id);
		if (!access || !hasCapability(access.permissions, "feedback.triage")) continue;
		const { user } = access;
		if (!user.email || user.emailVerificationTime === undefined) continue;
		const email = user.email.toLowerCase();
		if (seen.has(email)) continue;
		seen.add(email);
		if (!wants(await preferenceRow(ctx, user._id, project._id), kind)) continue;
		if (await isSuppressed(ctx, email)) continue;
		recipients.push({ userId: user._id, email, name: user.name ?? null });
	}
	return recipients;
}
