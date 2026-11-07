/**
 * Backend failure alerts: failed scheduled jobs and stuck deletions reach
 * OPS_ALERT_EMAIL once, throttled per function, never re-reported past the
 * watermark. Emails run in EMAIL_DEV_LOG mode and are read from the log.
 */
import { newConvexTest } from "../../test/convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import { RESTORE_WINDOW_MS } from "../projects/deletion";
import { groupFailures, planAlert, scrubError, throttleKey } from "./detect";

// Rebase the glob so module paths are relative to convex/ (as convex-test expects).
const modules = {
	...Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([path, load]) => [path.replace(/^\.\.\//, "./"), load])),
	...Object.fromEntries(Object.entries(import.meta.glob("./**/*.ts")).map(([path, load]) => [path.replace(/^\.\//, "./monitoring/"), load])),
};
const OPS = "ops@example.com";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
	vi.stubEnv("EMAIL_DEV_LOG", "true");
	vi.stubEnv("SITE_URL", "https://app.example.com");
	vi.stubEnv("OPS_ALERT_EMAIL", OPS);
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

function opsEmails() {
	return logSpy.mock.calls
		.map((call: unknown[]) => String(call[0]))
		.filter((line: string) => line.startsWith(`[email:dev] to=${OPS}`));
}

/** Schedules a real function with invalid args so the job ends up `failed`. */
async function failJob(t: ReturnType<typeof newConvexTest>) {
	await t.run(async (ctx) => {
		await ctx.scheduler.runAfter(0, internal.notifications.retention.purge, {
			bogus: "leak@example.com",
		} as never);
	});
	await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function failedJobCount(t: ReturnType<typeof newConvexTest>) {
	return t.run(async (ctx) => {
		const jobs = await ctx.db.system.query("_scheduled_functions").take(100);
		return jobs.filter((job) => job.state.kind === "failed").length;
	});
}

describe("failed scheduled functions", () => {
	test("a failed job is reported in one email, then never again", async () => {
		const t = newConvexTest(modules);
		await failJob(t);
		await failJob(t);
		expect(await failedJobCount(t)).toBe(2);

		vi.advanceTimersByTime(1000);
		await t.mutation(internal.monitoring.alerts.run, {});
		const emails = opsEmails();
		expect(emails).toHaveLength(1);
		expect(emails[0]).toContain("notifications/retention");
		expect(emails[0]).toContain("2 failure(s)");
		expect(emails[0]).not.toContain("leak@example.com");

		// Watermark: the same jobs are not reported again, even after the
		// throttle hour has passed.
		vi.advanceTimersByTime(2 * HOUR);
		await t.mutation(internal.monitoring.alerts.run, {});
		expect(opsEmails()).toHaveLength(1);
	});

	test("a failure storm sends at most one email per hour per function", async () => {
		const t = newConvexTest(modules);
		await failJob(t);
		vi.advanceTimersByTime(1000);
		await t.mutation(internal.monitoring.alerts.run, {});
		expect(opsEmails()).toHaveLength(1);

		// More failures within the hour: counted, not emailed.
		vi.advanceTimersByTime(15 * 60 * 1000);
		await failJob(t);
		await failJob(t);
		vi.advanceTimersByTime(1000);
		await t.mutation(internal.monitoring.alerts.run, {});
		expect(opsEmails()).toHaveLength(1);
		const rows = await t.run((ctx) => ctx.db.query("monitoringThrottle").take(10));
		expect(rows).toHaveLength(1);
		expect(rows[0].key).toMatch(/^fn:notifications\/retention/);
		expect(rows[0].suppressed).toBe(2);

		// After the hour the suppressed failures are reported, once.
		vi.advanceTimersByTime(HOUR);
		await t.mutation(internal.monitoring.alerts.run, {});
		const emails = opsEmails();
		expect(emails).toHaveLength(2);
		expect(emails[1]).toContain("incl. 2 while throttled");
		vi.advanceTimersByTime(2 * HOUR);
		await t.mutation(internal.monitoring.alerts.run, {});
		expect(opsEmails()).toHaveLength(2);
	});

	test("without OPS_ALERT_EMAIL the run logs one error and does nothing else", async () => {
		vi.stubEnv("OPS_ALERT_EMAIL", "");
		const t = newConvexTest(modules);
		await failJob(t);
		errorSpy.mockClear();
		await t.mutation(internal.monitoring.alerts.run, {});

		const monitoringErrors = errorSpy.mock.calls.filter((call: unknown[]) => String(call[0]).includes("OPS_ALERT_EMAIL"));
		expect(monitoringErrors).toHaveLength(1);
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(opsEmails()).toHaveLength(0);
		expect(logSpy).not.toHaveBeenCalled();
		const rows = await t.run(async (ctx) => ({
			state: await ctx.db.query("monitoringState").take(10),
			throttle: await ctx.db.query("monitoringThrottle").take(10),
		}));
		expect(rows.state).toHaveLength(0);
		expect(rows.throttle).toHaveLength(0);
	});

	test("recentFailures lists failed jobs for manual checks", async () => {
		const t = newConvexTest(modules);
		await failJob(t);
		const result = await t.query(internal.monitoring.alerts.recentFailures, {});
		expect(result.failures).toHaveLength(1);
		expect(result.failures[0].name).toContain("notifications/retention");
		expect(result.stuckDeletions).toHaveLength(0);
	});
});

describe("stuck deletions", () => {
	test("projects and organizations past the restore window + 1 day are reported", async () => {
		const t = newConvexTest(modules);
		const now = Date.now();
		const ids = await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", { name: "Ada", email: "ada@example.com" });
			const live = await ctx.db.insert("organizations", { name: "Live", slug: "live", ownerId });
			const stuckOrg = await ctx.db.insert("organizations", {
				name: "Gone",
				slug: "gone",
				ownerId,
				deletionRequestedAt: now - RESTORE_WINDOW_MS - 2 * DAY,
			});
			const project = {
				organizationId: live,
				description: "",
				status: "Archived" as const,
				inboxEnabled: false,
				defaultPriority: "Medium",
				criticalAlerts: false,
				weeklyDigest: false,
			};
			const stuckProject = await ctx.db.insert("projects", {
				...project,
				name: "Stuck",
				slug: "stuck",
				deletionRequestedAt: now - RESTORE_WINDOW_MS - 2 * DAY,
			});
			// Still inside the window (or its one-day grace): not stuck.
			await ctx.db.insert("projects", {
				...project,
				name: "Pending",
				slug: "pending",
				deletionRequestedAt: now - RESTORE_WINDOW_MS - HOUR,
			});
			await ctx.db.insert("projects", { ...project, status: "Active", name: "Live", slug: "live-p" });
			return { stuckOrg, stuckProject };
		});

		await t.mutation(internal.monitoring.alerts.run, {});
		const emails = opsEmails();
		expect(emails).toHaveLength(1);
		expect(emails[0]).toContain("2 stuck deletions");
		expect(emails[0]).toContain(`organization ${ids.stuckOrg}`);
		expect(emails[0]).toContain(`project ${ids.stuckProject}`);

		// Reminded at most once a day while it stays stuck.
		vi.advanceTimersByTime(2 * HOUR);
		await t.mutation(internal.monitoring.alerts.run, {});
		expect(opsEmails()).toHaveLength(1);
		vi.advanceTimersByTime(DAY);
		await t.mutation(internal.monitoring.alerts.run, {});
		expect(opsEmails()).toHaveLength(2);
	});
});

describe("detection rules", () => {
	test("error text is scrubbed of emails, flattened and truncated", () => {
		expect(scrubError("Uncaught Error: user Jane.Doe+x@mail.example.org\n not found")).toBe(
			"Uncaught Error: user [email] not found",
		);
		expect(scrubError(undefined)).toBe("(no error message recorded)");
		expect(scrubError("x".repeat(1000)).length).toBe(301);
	});

	test("failures are grouped by function and filtered by the watermark", () => {
		const groups = groupFailures(
			[
				{ id: "j1", name: "a:run", completedTime: 5, error: "old" },
				{ id: "j2", name: "a:run", completedTime: 20, error: "first a@b.co" },
				{ id: "j3", name: "a:run", completedTime: 30, error: "second" },
				{ id: "j4", name: "b:run", completedTime: 25, error: "b" },
			],
			10,
		);
		expect(groups).toEqual([
			{ name: "a:run", count: 2, firstError: "first [email]", jobIds: ["j2", "j3"] },
			{ name: "b:run", count: 1, firstError: "b", jobIds: ["j4"] },
		]);
	});

	test("throttled groups only add to their suppressed count", () => {
		const now = 10 * HOUR;
		const plan = planAlert({
			groups: [
				{ name: "a:run", count: 3, firstError: "x", jobIds: ["j1"] },
				{ name: "b:run", count: 1, firstError: "y", jobIds: ["j2"] },
			],
			stuck: [],
			throttles: new Map([
				[throttleKey("a:run"), { lastAlertAt: now - 10 * 60 * 1000, suppressed: 1 }],
				[throttleKey("b:run"), { lastAlertAt: now - 2 * HOUR, suppressed: 4 }],
			]),
			lapsed: new Map(),
			now,
		});
		expect(plan.failures.map((group) => [group.name, group.count])).toEqual([["b:run", 5]]);
		expect(plan.throttleUpdates.get(throttleKey("a:run"))).toEqual({ lastAlertAt: now - 10 * 60 * 1000, suppressed: 4 });
		expect(plan.throttleUpdates.get(throttleKey("b:run"))).toEqual({ lastAlertAt: now, suppressed: 0 });
	});
});
