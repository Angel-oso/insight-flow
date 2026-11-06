import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Weekly feedback digest for projects with `weeklyDigest` on: Mondays at
// 14:00 UTC (morning in the Americas, afternoon in Europe). The job pages
// through projects and schedules one digest per project.
crons.cron(
	"weekly feedback digest",
	"0 14 * * 1",
	internal.notifications.digest.run,
	{ cursor: null },
);

// Daily at 03:30 UTC: delete invitation links that expired over 30 days ago
// (accepted links included). Bounded batches that reschedule themselves.
crons.cron(
	"purge stale invitations",
	"30 3 * * *",
	internal.invitations.mutations.purgeStale,
	{},
);

// Daily at 04:10 UTC: delete stored emails (bodies hold feedback content
// and addresses) finalized over 7 days ago or abandoned over 14, and trim
// the critical alert ledger.
crons.cron(
	"purge sent emails",
	"10 4 * * *",
	internal.notifications.retention.purge,
	{},
);
// Every 15 minutes: email OPS_ALERT_EMAIL about failed scheduled functions
// and deletions whose purge never finished (convex/monitoring/alerts.ts).
crons.interval(
	"backend failure alerts",
	{ minutes: 15 },
	internal.monitoring.alerts.run,
	{},
);
// [area:notifications] crons
// [area:lifecycle] crons
// [area:feedback-data] crons

// Hourly: delete uploads that were never registered as attachments (see
// convex/attachments/cleanup.ts). Reads only files created since last run.
crons.interval(
	"sweep orphaned uploads",
	{ hours: 1 },
	internal.attachments.cleanup.sweepOrphans,
	{},
);
// Daily at 04:40 UTC: trim the critical webhook dedupe ledger.
crons.cron(
	"purge critical webhook log",
	"40 4 * * *",
	internal.integrations.webhooks.purgeCriticalLog,
	{},
);
// [area:attachments-integrations] crons

export default crons;
