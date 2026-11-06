/**
 * Pure logic behind the ops failure alert (convex/monitoring/alerts.ts):
 * scrubbing, grouping, throttling and the email body. No ctx here, so every
 * rule is unit-testable on plain objects.
 */
import { escapeHtml, layout, type EmailContent } from "../email/templates";

const HOUR_MS = 60 * 60 * 1000;
/** At most one email per hour per failing function. */
export const FUNCTION_THROTTLE_MS = HOUR_MS;
/** A stuck deletion is reported when first seen, then once a day while it stays. */
export const STUCK_THROTTLE_MS = 24 * HOUR_MS;
const ERROR_PREVIEW_CHARS = 300;
const JOB_IDS_PER_GROUP = 10;

export type FailedJob = {
	id: string;
	name: string;
	completedTime: number;
	error: string;
};

export type StuckDeletion = {
	kind: "project" | "organization";
	id: string;
	requestedAt: number;
	/** State of the purge job, when it is still in `_scheduled_functions`. */
	purgeState?: string;
};

export type FailureGroup = {
	name: string;
	count: number;
	firstError: string;
	jobIds: string[];
};

export type Throttle = { lastAlertAt: number; suppressed: number };

export type AlertPlan = {
	/** Groups to email, `count` already including failures suppressed earlier. */
	failures: (FailureGroup & { suppressedEarlier: number })[];
	stuck: StuckDeletion[];
	/** Throttle rows to write, keyed like `throttleKey`/`stuckKey`. */
	throttleUpdates: Map<string, Throttle>;
};

export const throttleKey = (functionName: string) => `fn:${functionName}`;
export const stuckKey = (item: Pick<StuckDeletion, "kind" | "id">) => `stuck:${item.kind}:${item.id}`;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Error text without email addresses, on one line, truncated. */
export function scrubError(text: string | undefined) {
	const clean = (text ?? "").replace(EMAIL_PATTERN, "[email]").replace(/\s+/g, " ").trim();
	if (!clean) return "(no error message recorded)";
	return clean.length > ERROR_PREVIEW_CHARS ? `${clean.slice(0, ERROR_PREVIEW_CHARS)}…` : clean;
}

/** Failed jobs completed after `watermark`, grouped by function, oldest error first. */
export function groupFailures(jobs: FailedJob[], watermark: number): FailureGroup[] {
	const groups = new Map<string, FailureGroup>();
	const fresh = jobs
		.filter((job) => job.completedTime > watermark)
		.sort((a, b) => a.completedTime - b.completedTime);
	for (const job of fresh) {
		const group = groups.get(job.name);
		if (group) {
			group.count++;
			if (group.jobIds.length < JOB_IDS_PER_GROUP) group.jobIds.push(job.id);
		} else {
			groups.set(job.name, {
				name: job.name,
				count: 1,
				firstError: scrubError(job.error),
				jobIds: [job.id],
			});
		}
	}
	return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The next watermark: the newest completion time among the jobs seen. */
export function nextWatermark(jobs: FailedJob[], watermark: number) {
	return jobs.reduce((max, job) => Math.max(max, job.completedTime), watermark);
}

/**
 * Decides what goes into this run's email. Throttled functions only add to
 * their `suppressed` count; once the hour has passed, earlier suppressed
 * failures are reported even if nothing new failed (`lapsed`).
 */
export function planAlert({
	groups,
	stuck,
	throttles,
	lapsed,
	now,
}: {
	groups: FailureGroup[];
	stuck: StuckDeletion[];
	/** Existing rows for every key in `groups` and `stuck` (missing = never alerted). */
	throttles: Map<string, Throttle>;
	/** Function names with suppressed failures and no alert in the last hour. */
	lapsed: Map<string, number>;
	now: number;
}): AlertPlan {
	const plan: AlertPlan = { failures: [], stuck: [], throttleUpdates: new Map() };
	const seen = new Set<string>();
	for (const group of groups) {
		const key = throttleKey(group.name);
		seen.add(key);
		const row = throttles.get(key);
		if (row && now - row.lastAlertAt < FUNCTION_THROTTLE_MS) {
			plan.throttleUpdates.set(key, { lastAlertAt: row.lastAlertAt, suppressed: row.suppressed + group.count });
			continue;
		}
		const earlier = row?.suppressed ?? 0;
		plan.failures.push({ ...group, count: group.count + earlier, suppressedEarlier: earlier });
		plan.throttleUpdates.set(key, { lastAlertAt: now, suppressed: 0 });
	}
	for (const [name, suppressed] of lapsed) {
		const key = throttleKey(name);
		if (seen.has(key) || suppressed <= 0) continue;
		plan.failures.push({
			name,
			count: suppressed,
			suppressedEarlier: suppressed,
			firstError: "(reported earlier; run monitoring/alerts:recentFailures for details)",
			jobIds: [],
		});
		plan.throttleUpdates.set(key, { lastAlertAt: now, suppressed: 0 });
	}
	for (const item of stuck) {
		const key = stuckKey(item);
		const row = throttles.get(key);
		if (row && now - row.lastAlertAt < STUCK_THROTTLE_MS) continue;
		plan.stuck.push(item);
		plan.throttleUpdates.set(key, { lastAlertAt: now, suppressed: 0 });
	}
	return plan;
}

export function hasAlerts(plan: AlertPlan) {
	return plan.failures.length > 0 || plan.stuck.length > 0;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function alertEmail(plan: AlertPlan, deployment: string): EmailContent {
	const total = plan.failures.reduce((sum, group) => sum + group.count, 0);
	const parts = [
		total ? `${total} failed background job${total === 1 ? "" : "s"}` : "",
		plan.stuck.length ? `${plan.stuck.length} stuck deletion${plan.stuck.length === 1 ? "" : "s"}` : "",
	].filter(Boolean);
	const subject = `[InsightFlow ops] ${parts.join(", ")}`;

	const textLines = [`Deployment: ${deployment}`, ""];
	let html = `<p style="margin:0 0 16px;">Deployment: <code>${escapeHtml(deployment)}</code></p>`;
	if (plan.failures.length) {
		textLines.push("Failed scheduled functions:");
		html += `<p style="margin:0 0 8px;font-weight:600;">Failed scheduled functions</p><ul style="margin:0 0 16px;padding-left:20px;">`;
		for (const group of plan.failures) {
			const throttled = group.suppressedEarlier
				? ` (incl. ${group.suppressedEarlier} while throttled)`
				: "";
			const ids = group.jobIds.length ? `jobs: ${group.jobIds.join(", ")}` : "";
			textLines.push(`- ${group.name}: ${group.count} failure(s)${throttled}`, `  error: ${group.firstError}`);
			if (ids) textLines.push(`  ${ids}`);
			html += `<li style="margin-bottom:8px;"><code>${escapeHtml(group.name)}</code>: ${group.count} failure(s)${escapeHtml(throttled)}<br><span style="color:#52525b;">${escapeHtml(group.firstError)}</span>${ids ? `<br><span style="font-size:12px;color:#71717a;">${escapeHtml(ids)}</span>` : ""}</li>`;
		}
		html += "</ul>";
		textLines.push("");
	}
	if (plan.stuck.length) {
		textLines.push("Deletions past the restore window that were never purged:");
		html += `<p style="margin:0 0 8px;font-weight:600;">Deletions past the restore window that were never purged</p><ul style="margin:0 0 16px;padding-left:20px;">`;
		for (const item of plan.stuck) {
			const line = `${item.kind} ${item.id}: deletion requested ${iso(item.requestedAt)}${item.purgeState ? `, purge job ${item.purgeState}` : ""}`;
			textLines.push(`- ${line}`);
			html += `<li>${escapeHtml(line)}</li>`;
		}
		html += "</ul>";
		textLines.push("");
	}
	textLines.push(
		"Details: Convex dashboard → Logs / Schedules, or `npx convex run monitoring/alerts:recentFailures`.",
	);
	const footer = "Sent by the InsightFlow backend monitor (OPS_ALERT_EMAIL). At most one email per hour per failing function.";
	return {
		subject,
		text: `${textLines.join("\n")}\n\n${footer}`,
		html: layout({
			preheader: parts.join(", "),
			body: `${html}<p style="margin:0;font-size:13px;color:#52525b;">Details: Convex dashboard → Logs / Schedules, or <code>npx convex run monitoring/alerts:recentFailures</code>.</p>`,
			footer: escapeHtml(footer),
		}),
	};
}
