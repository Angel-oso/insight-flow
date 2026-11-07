import { ConvexError, v } from "convex/values";
import { hasCapability } from "../../lib/auth/permissions";
import type { Doc, Id } from "../_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "../_generated/server";
import { requireProject } from "../feedback/access";
import { enforceUserRateLimit } from "../rateLimits";
import { isSuppressed } from "./suppression";

/** The two email lists a member can opt out of, per project. */
export type NotificationKind = "critical" | "digest";
export const vNotificationKind = v.union(v.literal("critical"), v.literal("digest"));

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export const UNSUBSCRIBE_PATH = "/notifications/unsubscribe";

export function isWellFormedToken(token: string) {
	return TOKEN_PATTERN.test(token);
}

function newToken() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function preferenceRow(
	ctx: QueryCtx,
	userId: Id<"users">,
	projectId: Id<"projects">,
) {
	return await ctx.db
		.query("notificationPreferences")
		.withIndex("by_userId_projectId", (q) => q.eq("userId", userId).eq("projectId", projectId))
		.unique();
}

/**
 * Drops the member's preferences (and unsubscribe token) for a project they
 * no longer belong to. Personal data is not kept past membership; a member
 * who rejoins starts from the defaults.
 */
export async function deletePreferenceRow(
	ctx: MutationCtx,
	userId: Id<"users">,
	projectId: Id<"projects">,
) {
	const row = await preferenceRow(ctx, userId, projectId);
	if (row) await ctx.db.delete("notificationPreferences", row._id);
}

/** A missing row means the member never changed anything: all on. */
export function wants(row: Doc<"notificationPreferences"> | null, kind: NotificationKind) {
	if (!row) return true;
	return kind === "critical" ? row.criticalAlerts : row.weeklyDigest;
}

/** The member's preference row, created with defaults (and a token) if missing. */
async function ensureRow(ctx: MutationCtx, userId: Id<"users">, projectId: Id<"projects">) {
	const existing = await preferenceRow(ctx, userId, projectId);
	if (existing) return existing;
	const id = await ctx.db.insert("notificationPreferences", {
		userId,
		projectId,
		criticalAlerts: true,
		weeklyDigest: true,
		unsubscribeToken: newToken(),
		updatedAt: Date.now(),
	});
	return (await ctx.db.get("notificationPreferences", id))!;
}

/** Convex HTTP origin that serves the unsubscribe route, if known. */
function httpOrigin() {
	const value = typeof process === "undefined" ? undefined : process.env.CONVEX_SITE_URL;
	const trimmed = value?.trim();
	return trimmed ? trimmed.replace(/\/+$/, "") : null;
}

/**
 * Unsubscribe link and RFC 8058 headers for one recipient and list. Without
 * a known HTTP origin the headers are omitted and the footer falls back to
 * the settings page, so a misconfigured deployment never sends a dead link.
 */
export async function unsubscribeFor(
	ctx: MutationCtx,
	userId: Id<"users">,
	projectId: Id<"projects">,
	kind: NotificationKind,
	fallbackUrl: string,
) {
	const origin = httpOrigin();
	if (!origin) return { url: fallbackUrl, headers: [] };
	const row = await ensureRow(ctx, userId, projectId);
	const url = `${origin}${UNSUBSCRIBE_PATH}?token=${row.unsubscribeToken}&list=${kind}`;
	return {
		url,
		headers: [
			{ name: "List-Unsubscribe", value: `<${url}>` },
			{ name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
		],
	};
}

const preferencesValidator = v.object({
	criticalAlerts: v.boolean(),
	weeklyDigest: v.boolean(),
	/** Project-wide switches set by project admins. */
	projectCriticalAlerts: v.boolean(),
	projectWeeklyDigest: v.boolean(),
	/** Only members who can triage receive notification emails. */
	canTriage: v.boolean(),
	emailVerified: v.boolean(),
	/** The address bounced or reported spam; notifications are paused. */
	suppressed: v.boolean(),
});

/** The signed-in member's own preferences for a project. */
export const get = query({
	args: { projectSlug: v.string() },
	returns: preferencesValidator,
	handler: async (ctx, { projectSlug }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		const row = await preferenceRow(ctx, access.user._id, project._id);
		const email = access.user.email?.toLowerCase();
		return {
			criticalAlerts: wants(row, "critical"),
			weeklyDigest: wants(row, "digest"),
			projectCriticalAlerts: project.criticalAlerts,
			projectWeeklyDigest: project.weeklyDigest,
			canTriage: hasCapability(access.permissions, "feedback.triage"),
			emailVerified: !!email && access.user.emailVerificationTime !== undefined,
			suppressed: email ? await isSuppressed(ctx, email) : false,
		};
	},
});

/** Updates the caller's own preferences. Never another member's. */
export const update = mutation({
	args: {
		projectSlug: v.string(),
		criticalAlerts: v.optional(v.boolean()),
		weeklyDigest: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, { projectSlug, criticalAlerts, weeklyDigest }) => {
		await enforceUserRateLimit(ctx, "notificationPreferences");
		const { project, access } = await requireProject(ctx, projectSlug);
		if (criticalAlerts === undefined && weeklyDigest === undefined)
			throw new ConvexError("Choose a notification setting to change.");
		const row = await ensureRow(ctx, access.user._id, project._id);
		await ctx.db.patch("notificationPreferences", row._id, {
			...(criticalAlerts !== undefined ? { criticalAlerts } : {}),
			...(weeklyDigest !== undefined ? { weeklyDigest } : {}),
			updatedAt: Date.now(),
		});
		return null;
	},
});

async function rowByToken(ctx: QueryCtx, token: string) {
	if (!isWellFormedToken(token)) return null;
	return await ctx.db
		.query("notificationPreferences")
		.withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", token))
		.unique();
}

const unsubscribeTarget = v.union(
	v.null(),
	v.object({ projectName: v.string(), subscribed: v.boolean() }),
);

/** Read-only lookup for the GET confirmation page. */
export const unsubscribeInfo = internalQuery({
	args: { token: v.string(), list: vNotificationKind },
	returns: unsubscribeTarget,
	handler: async (ctx, { token, list }) => {
		const row = await rowByToken(ctx, token);
		if (!row) return null;
		const project = await ctx.db.get("projects", row.projectId);
		if (!project) return null;
		return { projectName: project.name, subscribed: wants(row, list) };
	},
});

/** One-click unsubscribe (POST only; see convex/notifications/webhooks.ts). */
export const unsubscribe = internalMutation({
	args: { token: v.string(), list: vNotificationKind },
	returns: unsubscribeTarget,
	handler: async (ctx, { token, list }) => {
		const row = await rowByToken(ctx, token);
		if (!row) return null;
		const project = await ctx.db.get("projects", row.projectId);
		if (!project) return null;
		if (wants(row, list)) {
			await ctx.db.patch("notificationPreferences", row._id, {
				...(list === "critical" ? { criticalAlerts: false } : { weeklyDigest: false }),
				updatedAt: Date.now(),
			});
		}
		return { projectName: project.name, subscribed: false };
	},
});
