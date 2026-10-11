import { expect, test } from "vitest";
import { customWindow, overviewWindow } from "../../components/home/dashboard/date-window";

const day = 86_400_000;
const now = Date.UTC(2026, 2, 20, 15, 30);

test("preset windows end at the client clock and carry a readable label", () => {
	expect(overviewWindow("30", "", "", now)).toEqual({ from: now - 30 * day, to: now, label: "Last 30 days" });
});

test("custom dates include both UTC calendar days, including today", () => {
	expect(customWindow("2026-03-03", "2026-03-20", now)).toEqual({
		from: Date.UTC(2026, 2, 3), to: Date.UTC(2026, 2, 21), label: "Mar 3 – Mar 20",
	});
	expect(customWindow("2026-03-20", "2026-03-20", now)).toMatchObject({ from: Date.UTC(2026, 2, 20), to: Date.UTC(2026, 2, 21) });
});

test.each([
	["2026-03-20", "2026-03-03"], ["2026-03-03", "2026-03-21"],
	["2025-03-20", "2026-03-20"], ["2026-02-30", "2026-03-20"],
	["2026-3-3", "2026-03-20"], ["", ""],
])("invalid custom dates are not sent to the query: %s – %s", (from, to) => {
	expect(customWindow(from, to, now)).toBeNull();
});

test("inclusive 365-day custom range is accepted", () => {
	const result = customWindow("2025-03-21", "2026-03-20", now);
	expect(result).not.toBeNull();
	expect(result!.to - result!.from).toBe(365 * day);
});
