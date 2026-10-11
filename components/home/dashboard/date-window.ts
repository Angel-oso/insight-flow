export const OVERVIEW_RANGES = ["7", "30", "90", "custom"] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];
export type OverviewWindow = { from: number; to: number; label: string };
const dayMs = 86_400_000;

export function utcDate(timestamp: number) {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function parseDate(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const timestamp = Date.parse(`${value}T00:00:00.000Z`);
	return Number.isFinite(timestamp) && utcDate(timestamp) === value ? timestamp : null;
}

/** Native input dates are inclusive UTC days; queries use an exclusive end. */
export function customWindow(fromDate: string, toDate: string, now: number): OverviewWindow | null {
	const from = parseDate(fromDate);
	const lastDay = parseDate(toDate);
	if (from === null || lastDay === null || from > lastDay || toDate > utcDate(now)) return null;
	const to = lastDay + dayMs;
	if (to - from > 365 * dayMs) return null;
	const format = (timestamp: number) => new Date(timestamp).toLocaleDateString("en-US", {
		month: "short", day: "numeric", timeZone: "UTC",
		...(new Date(from).getUTCFullYear() !== new Date(lastDay).getUTCFullYear() ? { year: "numeric" } : {}),
	});
	return { from, to, label: `${format(from)} – ${format(lastDay)}` };
}

export function overviewWindow(range: OverviewRange, fromDate: string, toDate: string, now: number): OverviewWindow | null {
	if (range === "custom") return customWindow(fromDate, toDate, now);
	return { from: now - Number(range) * dayMs, to: now, label: `Last ${range} days` };
}
