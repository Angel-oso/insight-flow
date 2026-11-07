import { ConvexError, v, type Infer } from "convex/values";

import { hasCapability } from "../../lib/auth/permissions";
import { exceedsGrants, resolveProjectAccess, rolePermissions } from "../access/roles";
import { logAudit } from "../audit/log";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "../_generated/server";
import { appUrl, emailMode } from "../email/config";
import { projectInvitationEmail } from "../email/invitationTemplate";
import { deliverEmail } from "../email/send";
import { getSessionUserId, requireCapability, requireProject } from "../feedback/access";
import { isSuppressed } from "../notifications/suppression";
import { capMessage, fullScopeFor } from "./caps";
import { enforceRateLimit, enforceUserRateLimit } from "../rateLimits";

const expiryHours = v.union(v.literal(1), v.literal(6), v.literal(24));

const createArgs = {
	creatorId: v.id("users"),
	projectSlug: v.string(),
	roleId: v.id("roles"),
	expiresInHours: expiryHours,
	token: v.string(),
	expiresAt: v.number(),
};
type CreateArgs = { [K in keyof typeof createArgs]: Infer<(typeof createArgs)[K]> };

/** Longest address accepted (RFC 5321 path limit). */
const EMAIL_MAX_LENGTH = 254;

/**
 * Trimmed, lowercased address, or null when it is not a single plain
 * address (no display names, lists, quotes or control characters).
 */
export function normalizeInviteEmail(raw: string) {
	const email = raw.trim().toLowerCase();
	if (!email || email.length > EMAIL_MAX_LENGTH) return null;
	if (!/^[^\s@,;:<>()[\]"\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email))
		return null;
	return email;
}

/**
 * Address with the local part hidden ("j***@example.com"), for audit
 * summaries that should not store the full invitee address.
 */
export function maskEmail(email: string) {
	const at = email.lastIndexOf("@");
	if (at <= 0) return "***";
	return `${email[0]}***${email.slice(at)}`;
}

/**
 * Checks the creator may hand out `roleId` in the project and inserts a
 * pending invitation. Shared by link and email invitations.
 */
async function insertInvitation(
	ctx: MutationCtx,
	args: CreateArgs,
	email?: string,
) {
	const project = await ctx.db
		.query("projects")
		.withIndex("by_slug", (q) => q.eq("slug", args.projectSlug))
		.unique();
	if (!project || project.deletionRequestedAt !== undefined)
		throw new ConvexError("Project not found.");
	const creator = await resolveProjectAccess(ctx, args.creatorId, project._id);
	if (!creator || !hasCapability(creator.permissions, "team.manage")) {
		throw new ConvexError("You cannot invite members to this project.");
	}
	if (project.status === "Archived")
		throw new ConvexError("Archived projects cannot be edited.");
	const role = await ctx.db.get("roles", args.roleId);
	if (!role || (role.projectId !== undefined && role.projectId !== project._id)) {
		throw new ConvexError("This role is not available.");
	}
	if (exceedsGrants(await rolePermissions(ctx, role), creator.permissions)) {
		throw new ConvexError("You cannot grant a role with more access than your own.");
	}
	if (args.expiresAt <= Date.now() || args.expiresInHours > 24) {
		throw new ConvexError("Invitation links can expire in at most one day.");
	}
	// No point handing out links nobody could use. `accept` re-checks.
	const full = await fullScopeFor(ctx, project);
	if (full) throw new ConvexError(capMessage(full));
	const invitationId = await ctx.db.insert("projectInvitations", {
		projectId: project._id,
		roleId: role._id,
		token: args.token,
		createdBy: args.creatorId,
		expiresAt: args.expiresAt,
		...(email ? { email } : {}),
	});
	await logAudit(ctx, {
		organizationId: project.organizationId,
		projectId: project._id,
		actorId: args.creatorId,
		action: "invitation.created",
		summary: email
			? `Invited ${maskEmail(email)} to ${project.name} as ${role.name}`
			: `Created a ${role.name} invitation link for ${project.name}`,
	});
	return { project, role, invitationId };
}

export const create = internalMutation({
	args: createArgs,
	returns: v.object({ token: v.string(), expiresAt: v.number() }),
	handler: async (ctx, args) => {
		await insertInvitation(ctx, args);
		return { token: args.token, expiresAt: args.expiresAt };
	},
});

/**
 * Invitation addressed to an email: the single-use link is emailed and
 * never returned to the inviter. Nothing here looks up accounts, so the
 * result is the same whether or not the address is registered. Rate limits
 * (inviter, project, recipient) are consumed in this transaction, so a
 * failed invitation does not count. Addresses suppressed after a hard
 * bounce or complaint get no email, but the caller sees the same result,
 * so suppression is not revealed.
 *
 * Anti-abuse: only inviters with a verified email may send, each
 * organization has a daily email budget on top of the per-project one, and
 * the template leaves out names that look like links or domains.
 */
export const createForEmail = internalMutation({
	args: { ...createArgs, email: v.string() },
	returns: v.object({ email: v.string(), expiresAt: v.number() }),
	handler: async (ctx, { email: rawEmail, ...args }) => {
		const email = normalizeInviteEmail(rawEmail);
		if (!email) throw new ConvexError("Enter a valid email address.");
		const inviter = await ctx.db.get("users", args.creatorId);
		if (!inviter?.email || inviter.emailVerificationTime === undefined)
			throw new ConvexError("Verify your email address before sending invitations by email.");
		await enforceRateLimit(ctx, "inviteEmailUser", args.creatorId);
		const { project, role } = await insertInvitation(ctx, args, email);
		await enforceRateLimit(ctx, "inviteEmailProject", project._id);
		await enforceRateLimit(ctx, "inviteEmailOrganization", project.organizationId);
		await enforceRateLimit(ctx, "inviteEmailRecipient", email);
		if (emailMode() === "disabled")
			throw new ConvexError(
				"Email delivery isn't configured yet. Share an invitation link instead.",
			);
		if (await isSuppressed(ctx, email)) return { email, expiresAt: args.expiresAt };
		const organization = await ctx.db.get("organizations", project.organizationId);
		await deliverEmail(ctx, {
			to: email,
			...projectInvitationEmail({
				projectName: project.name,
				organizationName: organization?.name ?? "",
				inviterName: inviter.name ?? "",
				role: role.name,
				inviteUrl: appUrl(`/invitations/${args.token}`),
				expires: new Date(args.expiresAt),
			}),
		});
		return { email, expiresAt: args.expiresAt };
	},
});

const failureReason = v.union(
	v.literal("invalid"),
	v.literal("used"),
	v.literal("expired"),
	v.literal("unavailable"),
	v.literal("archived"),
	v.literal("full"),
);

export const acceptResult = v.union(
	v.object({ ok: v.literal(true), projectSlug: v.string() }),
	v.object({ ok: v.literal(false), reason: failureReason, message: v.string() }),
);

type AcceptResult = typeof acceptResult.type;

const FAILURE_MESSAGES: Record<Extract<AcceptResult, { ok: false }>["reason"], string> = {
	invalid: "This invitation link is invalid.",
	used: "This invitation has already been used.",
	expired: "This invitation has expired.",
	unavailable: "This invitation is no longer available.",
	archived: "Archived projects cannot be edited.",
	full: "This project has reached its member limit. Ask an administrator to make room, then open this link again.",
};

function failure(reason: keyof typeof FAILURE_MESSAGES): AcceptResult {
	return { ok: false, reason, message: FAILURE_MESSAGES[reason] };
}

/**
 * Accept the link for the signed-in user; tokens never carry a user id.
 * Invalid, used, expired and revoked tokens return `{ ok: false }` instead
 * of throwing, so the rate-limit token consumed by the attempt commits and
 * guessing tokens is throttled (a thrown error would roll it back).
 * A full project or organization (member caps, see ./caps) also returns a
 * failure but leaves the invitation unused: the invitee did nothing wrong,
 * so the same link works once an administrator makes room (until it expires).
 */
export const accept = mutation({
	args: { token: v.string() },
	returns: acceptResult,
	handler: async (ctx, { token }): Promise<AcceptResult> => {
		const userId = await getSessionUserId(ctx);
		if (!userId) throw new ConvexError("Sign in to accept this invitation.");
		await enforceRateLimit(ctx, "acceptInvitation", userId);
		const invitation = await ctx.db
			.query("projectInvitations")
			.withIndex("by_token", (q) => q.eq("token", token))
			.unique();
		if (!invitation) return failure("invalid");
		if (invitation.acceptedAt) return failure("used");
		if (invitation.expiresAt <= Date.now()) return failure("expired");
		const [user, project, role] = await Promise.all([
			ctx.db.get("users", userId),
			ctx.db.get("projects", invitation.projectId),
			ctx.db.get("roles", invitation.roleId),
		]);
		if (!user || !project || !role || project.deletionRequestedAt !== undefined)
			return failure("unavailable");
		const organization = await ctx.db.get("organizations", project.organizationId);
		if (!organization || organization.deletionRequestedAt !== undefined)
			return failure("unavailable");
		if (project.status === "Archived") return failure("archived");
		// The link is only as good as its creator's current grants: someone
		// removed from the project (or demoted) since creating it can no
		// longer hand out access through it, including to themselves.
		const creator = await resolveProjectAccess(ctx, invitation.createdBy, project._id);
		if (
			!creator ||
			!hasCapability(creator.permissions, "team.manage") ||
			(role.projectId !== undefined && role.projectId !== project._id) ||
			exceedsGrants(await rolePermissions(ctx, role), creator.permissions)
		)
			return failure("unavailable");
		if (await fullScopeFor(ctx, project, userId)) return failure("full");
		const existingMembership = await ctx.db
			.query("projectMembers")
			.withIndex("by_projectId_userId", (q) =>
				q.eq("projectId", project._id).eq("userId", userId),
			)
			.unique();
		// Project access needs an organization membership too; create it even
		// when a project link already exists (e.g. pre-migration data).
		const organizationMembership = await ctx.db
			.query("organizationMembers")
			.withIndex("by_organizationId_userId", (q) =>
				q.eq("organizationId", project.organizationId).eq("userId", userId),
			)
			.unique();
		if (!organizationMembership) {
			const memberRole = await ctx.db
				.query("roles")
				.withIndex("by_name", (q) => q.eq("name", "member"))
				.unique();
			if (!memberRole) throw new ConvexError("Workspace access is not initialized.");
			await ctx.db.insert("organizationMembers", {
				organizationId: project.organizationId,
				userId,
				roleIds: [memberRole._id],
			});
		}
		if (!existingMembership) {
			await ctx.db.insert("projectMembers", {
				projectId: project._id,
				userId,
				roleId: role._id,
				joinedAt: Date.now(),
			});
		}
		await ctx.db.patch("projectInvitations", invitation._id, { acceptedAt: Date.now() });
		await logAudit(ctx, {
			organizationId: project.organizationId,
			projectId: project._id,
			actorId: userId,
			action: "invitation.accepted",
			targetUserId: userId,
			summary: `${user.name?.trim() || "Someone"} joined ${project.name} as ${role.name}${existingMembership ? " (already a member)" : ""}`,
		});
		return { ok: true, projectSlug: project.slug };
	},
});

/**
 * Revokes a pending invitation link of this project. Anyone who can manage
 * the project's team may revoke any of its links (including ones created by
 * someone else): revoking only ever removes access that was not granted yet.
 */
export const revoke = mutation({
	args: { projectSlug: v.string(), invitationId: v.id("projectInvitations") },
	returns: v.null(),
	handler: async (ctx, { projectSlug, invitationId }) => {
		await enforceUserRateLimit(ctx, "manageMembership");
		const { project, access } = await requireProject(ctx, projectSlug);
		const userId = await getSessionUserId(ctx);
		requireCapability(access.permissions, "team.manage");
		const invitation = await ctx.db.get("projectInvitations", invitationId);
		if (!invitation || invitation.projectId !== project._id)
			throw new ConvexError("Invitation not found.");
		if (invitation.acceptedAt)
			throw new ConvexError("This invitation has already been used.");
		await ctx.db.delete("projectInvitations", invitation._id);
		await logAudit(ctx, {
			organizationId: project.organizationId,
			projectId: project._id,
			actorId: userId,
			action: "invitation.revoked",
			summary: invitation.email
				? `Revoked the invitation sent to ${maskEmail(invitation.email)} for ${project.name}`
				: `Revoked an invitation link for ${project.name}`,
		});
		return null;
	},
});

const DAY_MS = 24 * 60 * 60 * 1000;
/** Expired (and accepted) links are kept this long for support questions. */
export const INVITATION_RETENTION_MS = 30 * DAY_MS;
const CLEANUP_BATCH = 200;

/**
 * Daily cron (convex/crons.ts): deletes invitation links that expired more
 * than 30 days ago. Accepted links are covered too, since every link expires
 * at most a day after creation whether or not it was used. Bounded batches;
 * reschedules itself while a full batch was deleted.
 */
export const purgeStale = internalMutation({
	args: {},
	returns: v.object({ deleted: v.number() }),
	handler: async (ctx) => {
		const cutoff = Date.now() - INVITATION_RETENTION_MS;
		const stale = await ctx.db
			.query("projectInvitations")
			.withIndex("by_expiresAt", (q) => q.lt("expiresAt", cutoff))
			.take(CLEANUP_BATCH);
		for (const invitation of stale) await ctx.db.delete("projectInvitations", invitation._id);
		if (stale.length === CLEANUP_BATCH)
			await ctx.scheduler.runAfter(0, internal.invitations.mutations.purgeStale, {});
		return { deleted: stale.length };
	},
});

/** Pending links read per project and transaction by the cleanup below. */
const PENDING_CLEANUP_BATCH = 200;

/**
 * Resume point of a pending-link scan: the last link read, by its position
 * in `by_projectId_acceptedAt_expiresAt` (expiresAt, then _creationTime).
 * Links that share an expiry across a batch boundary are never skipped.
 */
export const pendingCursor = v.object({ expiresAt: v.number(), creationTime: v.number() });
export type PendingCursor = Infer<typeof pendingCursor>;

/**
 * Deletes live pending links (not accepted, not expired) of `projectId`
 * created by `createdBy`; with `shouldDelete`, only the links it selects.
 * Reads at most PENDING_CLEANUP_BATCH links of the project, resuming after
 * `after`. Returns the resume point, or null when the whole range was
 * scanned. Uses `take` rather than `paginate` so one mutation can clean
 * several projects. Expired links are useless and left to purgeStale.
 * `accept` re-checks the creator anyway: this keeps the pending list honest
 * rather than being the only guard.
 */
export async function deletePendingLinksBy(
	ctx: MutationCtx,
	projectId: Id<"projects">,
	createdBy: Id<"users">,
	shouldDelete: (roleId: Id<"roles">) => Promise<boolean> | boolean = () => true,
	after: PendingCursor | null = null,
): Promise<PendingCursor | null> {
	const now = Date.now();
	const links = [];
	// Rest of the cursor's own expiry first (same expiresAt, created later).
	if (after && after.expiresAt > now)
		links.push(
			...(await ctx.db
				.query("projectInvitations")
				.withIndex("by_projectId_acceptedAt_expiresAt", (q) =>
					q
						.eq("projectId", projectId)
						.eq("acceptedAt", undefined)
						.eq("expiresAt", after.expiresAt)
						.gt("_creationTime", after.creationTime),
				)
				.take(PENDING_CLEANUP_BATCH)),
		);
	if (links.length < PENDING_CLEANUP_BATCH) {
		const from = Math.max(after?.expiresAt ?? 0, now);
		links.push(
			...(await ctx.db
				.query("projectInvitations")
				.withIndex("by_projectId_acceptedAt_expiresAt", (q) =>
					q.eq("projectId", projectId).eq("acceptedAt", undefined).gt("expiresAt", from),
				)
				.take(PENDING_CLEANUP_BATCH - links.length)),
		);
	}
	for (const link of links) {
		if (link.createdBy !== createdBy) continue;
		if (await shouldDelete(link.roleId)) await ctx.db.delete("projectInvitations", link._id);
	}
	if (links.length < PENDING_CLEANUP_BATCH) return null;
	const last = links[links.length - 1];
	return { expiresAt: last.expiresAt, creationTime: last._creationTime };
}

/**
 * Continuation of `revokeCreatorLinks` for projects with more pending links
 * than one batch. A bare number is a resume point from before cursors
 * included the creation time (jobs scheduled by an older deployment).
 */
export const deletePendingLinks = internalMutation({
	args: {
		projectId: v.id("projects"),
		createdBy: v.id("users"),
		after: v.union(pendingCursor, v.number()),
	},
	returns: v.null(),
	handler: async (ctx, { projectId, createdBy, after }) => {
		const cursor = typeof after === "number" ? { expiresAt: after, creationTime: 0 } : after;
		await revokeCreatorLinks(ctx, projectId, createdBy, cursor);
		return null;
	},
});

/** Deletes every live pending link `createdBy` made in `projectId`, in batches. */
export async function revokeCreatorLinks(
	ctx: MutationCtx,
	projectId: Id<"projects">,
	createdBy: Id<"users">,
	after: PendingCursor | null = null,
) {
	const next = await deletePendingLinksBy(ctx, projectId, createdBy, () => true, after);
	if (next !== null)
		await ctx.scheduler.runAfter(0, internal.invitations.mutations.deletePendingLinks, {
			projectId,
			createdBy,
			after: next,
		});
}
