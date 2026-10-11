"use client";

import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { presentOverview } from "./model";
import { overviewWindow, utcDate, type OverviewRange } from "./date-window";

export function useOverviewClock() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

/** Invalid URL dates never reach Convex; presets refresh once per minute. */
export function useProjectOverview(projectSlug: string, range: OverviewRange, fromDate: string, toDate: string) {
	const now = useOverviewClock();
	const window = overviewWindow(range, fromDate, toDate, now);
	const data = useQuery(api.dashboard.overview.get, window ? {
		projectSlug, from: window.from, to: window.to,
	} : "skip");
	return {
		overview: data ? presentOverview(data, data.project.name, now) : undefined,
		rangeLabel: window?.label ?? "Custom dates",
		today: utcDate(now),
		defaultFrom: utcDate(now - 29 * 86_400_000),
		error: window ? null : "Choose valid dates through today, covering no more than 365 days.",
	};
}
