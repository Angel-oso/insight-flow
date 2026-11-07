import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query } from "../_generated/server";
import { logAudit } from "../audit/log";
import { enforceUserRateLimit } from "../rateLimits";
import { requireCapability, requireProject } from "./access";
import { feedbackByReceived } from "./aggregates";

/**
 * Project feedback export (CSV or JSON) for project administrators
 * (`project.manage`), e.g. to answer a data-access request.
 *
 * Flow: `start` checks access, consumes a rate-limit token, writes the audit
 * entry and returns a short-lived grant; the browser then pages through
 * `page` with that grant and assembles the file. Pages are bounded, so any
 * project size works, and every read is tied to an audited export. Lines
 * are formatted on the server so CSV escaping (including spreadsheet
 * formula injection) lives in one tested place.
 */

/** How long one export grant stays valid. */
const EXPORT_TTL = 60 * 60 * 1000;
/** Most rows one `page` call returns. */
const EXPORT_PAGE_LIMIT = 200;

const formatValidator = v.union(v.literal("csv"), v.literal("json"));

export const EXPORT_COLUMNS = [
	"id",
	"title",
	"description",
	"category",
	"priority",
	"status",
	"assignee",
	"senderName",
	"senderEmail",
	"receivedAt",
	"updatedAt",
	"completedAt",
] as const;

type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], string | null>;

/**
 * One CSV cell. Cells a spreadsheet would evaluate as a formula (leading
 * = + - @, or a tab / carriage return) are prefixed with a single quote;
 * every cell is quoted with inner quotes doubled.
 */
export function csvCell(value: string | null) {
	const text = value ?? "";
	const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
	return `"${safe.replace(/"/g, '""')}"`;
}

export function csvLine(values: readonly (string | null)[]) {
	return values.map(csvCell).join(",");
}

const iso = (timestamp: number | undefined) =>
	timestamp === undefined ? null : new Date(timestamp).toISOString();

export const start = mutation({
	args: { projectSlug: v.string(), format: formatValidator },
	returns: v.object({
		exportId: v.id("feedbackExports"),
		// CSV header line; null for JSON.
		header: v.union(v.string(), v.null()),
		total: v.number(),
	}),
	handler: async (ctx, { projectSlug, format }) => {
		await enforceUserRateLimit(ctx, "exportFeedback");
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "project.manage");
		const now = Date.now();
		const exportId = await ctx.db.insert("feedbackExports", {
			projectId: project._id,
			userId: access.user._id,
			format,
			createdAt: now,
		});
		await ctx.scheduler.runAfter(EXPORT_TTL, internal.feedback.export.expire, { exportId });
		const total = await feedbackByReceived.count(ctx, { namespace: project._id });
		await logAudit(ctx, {
			organizationId: project.organizationId,
			projectId: project._id,
			actorId: access.user._id,
			action: "project.feedback_exported",
			summary: `Exported ${total} feedback item${total === 1 ? "" : "s"} from "${project.name}" as ${format.toUpperCase()}`,
		});
		return { exportId, header: format === "csv" ? csvLine(EXPORT_COLUMNS) : null, total };
	},
});

/**
 * One page of export lines, oldest first: CSV rows, or one JSON object per
 * line for JSON (the client wraps them in an array). Requires the caller's
 * own live grant for this project, plus `project.manage` at read time.
 */
export const page = query({
	args: {
		projectSlug: v.string(),
		exportId: v.id("feedbackExports"),
		paginationOpts: paginationOptsValidator,
	},
	returns: paginationResultValidator(v.string()),
	handler: async (ctx, { projectSlug, exportId, paginationOpts }) => {
		const { project, access } = await requireProject(ctx, projectSlug);
		requireCapability(access.permissions, "project.manage");
		const grant = await ctx.db.get("feedbackExports", exportId);
		if (!grant || grant.projectId !== project._id || grant.userId !== access.user._id)
			throw new ConvexError("This export has expired. Start a new one.");
		const result = await ctx.db
			.query("feedback")
			.withIndex("by_projectId_receivedAt", (q) => q.eq("projectId", project._id))
			.paginate({
				...paginationOpts,
				numItems: Math.max(1, Math.min(paginationOpts.numItems, EXPORT_PAGE_LIMIT)),
			});
		const names = new Map<Id<"users">, string>();
		const assigneeName = async (id: Id<"users"> | null) => {
			if (id === null) return null;
			if (!names.has(id)) names.set(id, (await ctx.db.get("users", id))?.name ?? "Former member");
			return names.get(id)!;
		};
		const toRow = async (item: Doc<"feedback">): Promise<ExportRow> => ({
			id: item._id,
			title: item.title,
			description: item.description,
			category: item.category,
			priority: item.priority,
			status: item.status,
			assignee: await assigneeName(item.assigneeId),
			senderName: item.sender?.name || null,
			senderEmail: item.sender?.email || null,
			receivedAt: iso(item.receivedAt),
			updatedAt: iso(item.updatedAt),
			completedAt: iso(item.completedAt),
		});
		const lines: string[] = [];
		for (const item of result.page) {
			const row = await toRow(item);
			lines.push(
				grant.format === "csv"
					? csvLine(EXPORT_COLUMNS.map((column) => row[column]))
					: JSON.stringify(row),
			);
		}
		return { ...result, page: lines };
	},
});

/** Deletes an export grant once its time is up. */
export const expire = internalMutation({
	args: { exportId: v.id("feedbackExports") },
	returns: v.null(),
	handler: async (ctx, { exportId }) => {
		if (await ctx.db.get("feedbackExports", exportId))
			await ctx.db.delete("feedbackExports", exportId);
		return null;
	},
});
