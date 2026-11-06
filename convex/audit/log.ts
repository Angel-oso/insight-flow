import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Organization-level audit actions. Keep this list closed so the UI can
 * label every entry; add a value here when a new admin action is logged.
 */
export type AuditAction =
	| "organization.role_changed"
	| "organization.ownership_transferred"
	| "organization.member_removed"
	| "organization.member_left"
	| "organization.renamed"
	| "organization.deletion_requested"
	| "organization.restored"
	| "project.created"
	| "project.deletion_requested"
	| "project.restored"
	| "project.settings_changed"
	| "project.member_role_changed"
	| "project.member_removed"
	| "project.admin_joined"
	| "project.role_created"
	| "project.role_deleted"
	| "project.feedback_exported"
	| "project.sender_redacted"
	| "project.integration_changed"
	| "invitation.created"
	| "invitation.revoked"
	| "invitation.accepted";

/** Max characters kept in an audit summary. */
const SUMMARY_LIMIT = 300;

/**
 * Appends one audit entry. Call it from the mutation that performs the
 * action so the entry commits (or rolls back) with the change itself.
 * `summary` is human-readable and must not contain secrets (tokens, codes).
 */
export async function logAudit(
	ctx: MutationCtx,
	entry: {
		organizationId: Id<"organizations">;
		projectId?: Id<"projects">;
		actorId?: Id<"users"> | null;
		action: AuditAction;
		targetUserId?: Id<"users">;
		summary: string;
	},
) {
	await ctx.db.insert("auditLogs", {
		organizationId: entry.organizationId,
		...(entry.projectId ? { projectId: entry.projectId } : {}),
		...(entry.actorId ? { actorId: entry.actorId } : {}),
		action: entry.action,
		...(entry.targetUserId ? { targetUserId: entry.targetUserId } : {}),
		summary: entry.summary.slice(0, SUMMARY_LIMIT),
		at: Date.now(),
	});
}
