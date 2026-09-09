"use client";

import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { presentTeam, type PresentedTeam } from "./model";

function useTeamClock() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

/** Live project team; undefined while the query loads. */
export function useProjectTeam(projectSlug: string): PresentedTeam | undefined {
	const now = useTeamClock();
	const data = useQuery(api.team.get, { projectSlug });
	if (!data) return undefined;
	return presentTeam(data, now);
}
