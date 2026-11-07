import { getAuthUserId } from "@convex-dev/auth/server";
import { DAY, HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { components } from "./_generated/api";
import type { ActionCtx, MutationCtx } from "./_generated/server";

/**
 * Production rate limits. Token buckets refill continuously at `rate` per
 * `period` and allow bursts up to `capacity`, so normal use never notices
 * them while scripts and floods are cut off quickly. Rate-limit state is
 * transactional: when the calling mutation fails, the consumed token is
 * returned, so invalid requests never count against legitimate users. Where
 * failed attempts must count (guessing invitation tokens), the mutation
 * returns a failure result instead of throwing so the consumption commits.
 */
const LIMITS = {
	// Public intake, per project: ~100 submissions/hour sustained with a
	// burst of 25 (a launch or an email blast), so one script cannot flood
	// an inbox while real traffic keeps flowing.
	intakeProject: { kind: "token bucket", rate: 100, period: HOUR, capacity: 25 },
	// Public intake, per sender email within a project: 5/hour, burst of 3.
	intakeSender: { kind: "token bucket", rate: 5, period: HOUR, capacity: 3 },
	// Workspace onboarding, per user: 5/day, burst of 3.
	createWorkspace: { kind: "token bucket", rate: 5, period: DAY, capacity: 3 },
	// New projects, per user: 20/hour, burst of 10.
	createProject: { kind: "token bucket", rate: 20, period: HOUR, capacity: 10 },
	// Invitation links, per user: 30/hour, burst of 10.
	createInvitation: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
	// Accepting invitation links, per user: 10/hour, burst of 5.
	acceptInvitation: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },
	// Team-logged feedback, per user: 120/hour, burst of 30.
	createFeedback: { kind: "token bucket", rate: 120, period: HOUR, capacity: 30 },
	// Internal notes, per user: 60/minute is far above typing speed; burst 20.
	addComment: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
	// Feedback deletion, per user: one call can remove up to 50 items (spam
	// cleanup), so 30 calls/minute with a burst of 10 is plenty.
	deleteFeedback: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 10 },
	// Project and organization deletion, per user: 10/hour, burst of 5.
	deleteWorkspaceData: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },
	// Membership changes (remove from / leave an organization, revoke links),
	// per user: 60/hour, burst of 20.
	manageMembership: { kind: "token bucket", rate: 60, period: HOUR, capacity: 20 },
	// [area:org-team] limits
	// [area:auth] limits
	// Feedback triage edits, per user: 60/minute with a burst of 30 covers
	// fast keyboard triage while stopping scripted priority toggling.
	updateFeedback: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },
	// Critical alert emails, per project: 5 per 10 minutes. Alerts over the
	// limit fold into one summary email (convex/notifications/critical.ts).
	criticalAlertProject: { kind: "token bucket", rate: 5, period: 10 * MINUTE, capacity: 5 },
	// Personal notification preference changes, per user.
	notificationPreferences: { kind: "token bucket", rate: 60, period: HOUR, capacity: 20 },
	// [area:notifications] limits
	// Feedback exports (whole-project personal data), per user: 10/hour, burst of 5.
	exportFeedback: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },
	// Submitter erasure requests, per user: 30/hour, burst of 10.
	redactSender: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
	// [area:feedback-data] limits
	// Restoring deleted projects and organizations, per user: 20/hour, burst of 10.
	restoreWorkspaceData: { kind: "token bucket", rate: 20, period: HOUR, capacity: 10 },
	// Invitations sent by email, per inviter: 20/hour, burst of 10.
	inviteEmailUser: { kind: "token bucket", rate: 20, period: HOUR, capacity: 10 },
	// Invitations sent by email, per project: 50/day, burst of 20.
	inviteEmailProject: { kind: "token bucket", rate: 50, period: DAY, capacity: 20 },
	// Invitations sent to one address (any project): 5/day, burst of 3, so
	// nobody's inbox can be flooded through the app.
	inviteEmailRecipient: { kind: "token bucket", rate: 5, period: DAY, capacity: 3 },
	// Invitations sent by email, per organization: at most 100 per day in
	// total, however many projects and admins it has.
	inviteEmailOrganization: { kind: "fixed window", rate: 100, period: DAY },
	// [area:lifecycle] limits
	// Attachment upload tickets and removals, per user: 60/hour, burst of 15.
	attachmentChange: { kind: "token bucket", rate: 60, period: HOUR, capacity: 15 },
	// Webhook create/update/delete, per user: 30/hour, burst of 10.
	webhookConfig: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
	// "Send test" deliveries, per user: 20/hour, burst of 5.
	webhookTest: { kind: "token bucket", rate: 20, period: HOUR, capacity: 5 },
	// Uploads through the attachment route (each also needs a ticket).
	attachmentUpload: { kind: "token bucket", rate: 60, period: HOUR, capacity: 15 },
	// [area:attachments-integrations] limits
} as const;

/** Maximum organizations a single user can own. */
export const MAX_OWNED_ORGANIZATIONS = 10;

export type RateLimitName = keyof typeof LIMITS;

export const rateLimiter = new RateLimiter(components.rateLimiter, LIMITS);

const MESSAGES: Record<RateLimitName, string> = {
	intakeProject: "This feedback form is receiving a lot of submissions right now.",
	intakeSender: "You've sent several submissions in a short time.",
	createWorkspace: "You've created several workspaces recently.",
	createProject: "You've created several projects recently.",
	createInvitation: "You've created several invitation links recently.",
	acceptInvitation: "Too many invitation attempts.",
	createFeedback: "You've logged a lot of feedback in a short time.",
	addComment: "You're adding notes too quickly.",
	deleteFeedback: "You're deleting feedback too quickly.",
	deleteWorkspaceData: "You've deleted several projects or organizations recently.",
	manageMembership: "You've changed memberships many times recently.",
	// [area:org-team] messages
	// [area:auth] messages
	updateFeedback: "You're updating feedback too quickly.",
	criticalAlertProject: "Too many critical alerts were sent for this project.",
	notificationPreferences: "You've changed your notification settings many times recently.",
	// [area:notifications] messages
	exportFeedback: "You've exported feedback several times recently.",
	redactSender: "You've submitted several erasure requests recently.",
	// [area:feedback-data] messages
	restoreWorkspaceData: "You've restored several projects or organizations recently.",
	inviteEmailUser: "You've sent several email invitations recently.",
	inviteEmailProject: "This project has sent many email invitations today.",
	inviteEmailRecipient: "This address has received several invitations recently.",
	inviteEmailOrganization: "This organization has sent many email invitations today.",
	// [area:lifecycle] messages
	attachmentChange: "You're changing attachments too quickly.",
	webhookConfig: "You've changed webhooks many times recently.",
	webhookTest: "You've sent several test deliveries recently.",
	attachmentUpload: "You're uploading files too quickly.",
	// [area:attachments-integrations] messages
};

/** Human-readable wait, rounded up: "a few seconds", "3 minutes", "2 hours". */
export function formatRetryAfter(ms: number) {
	const seconds = Math.ceil(ms / 1000);
	if (seconds < 10) return "a few seconds";
	if (seconds < 60) return `${seconds} seconds`;
	const minutes = Math.ceil(seconds / 60);
	if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
	const hours = Math.ceil(minutes / 60);
	return hours === 1 ? "1 hour" : `${hours} hours`;
}

/**
 * Consumes one token for `key` or throws a friendly `ConvexError` (string
 * data, like every other user-facing error) that says when to retry.
 */
export async function enforceRateLimit(
	ctx: MutationCtx | ActionCtx,
	name: RateLimitName,
	key: string,
) {
	const { ok, retryAfter } = await rateLimiter.limit(ctx, name, { key });
	if (!ok) {
		throw new ConvexError(
			`${MESSAGES[name]} Please try again in ${formatRetryAfter(retryAfter ?? 0)}.`,
		);
	}
}

/**
 * Per-user limit for authenticated handlers. Anonymous callers are left to
 * the handler's own sign-in check, so this can sit on the first line.
 */
export async function enforceUserRateLimit(ctx: MutationCtx | ActionCtx, name: RateLimitName) {
	const userId = await getAuthUserId(ctx);
	if (userId) await enforceRateLimit(ctx, name, userId);
}
