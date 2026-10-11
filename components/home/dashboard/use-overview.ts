"use client";

import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { presentOverview, type PresentedOverview } from "./model";

export const OVERVIEW_RANGES = [7, 30, 90] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];

function useOverviewClock() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

/** Live project overview; undefined while the query loads. */
export function useProjectOverview(
	projectSlug: string,
	rangeDays: OverviewRange,
): PresentedOverview | undefined {
	const now = useOverviewClock();
	const data = useQuery(api.dashboard.overview.get, {
		projectSlug,
		rangeDays,
		now,
	});
	if (!data) return undefined;
	return presentOverview(data, data.project.name, now);
}
