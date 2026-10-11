"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

export type ProjectSettingsUpdate = {
	name?: string;
	description?: string;
	status?: Doc<"projects">["status"];
	inboxEnabled?: boolean;
	defaultPriority?: Doc<"projects">["defaultPriority"];
};

export function useProjectSettingsData(projectSlug: string) {
	return useQuery(api.projects.settings.get, { projectSlug });
}

export function useProjectSettingsWrites(projectSlug: string) {
	const update = useMutation(api.projects.settings.update);
	const restore = useMutation(api.projects.settings.restore);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inFlight = useRef(false);

	async function run(write: () => Promise<null>) {
		if (inFlight.current) return false;
		inFlight.current = true;
		setPending(true);
		setError(null);
		try {
			await write();
			return true;
		} catch (cause) {
			setError(
				cause instanceof ConvexError && typeof cause.data === "string"
					? cause.data
					: "Could not save settings. Please try again.",
			);
			return false;
		} finally {
			inFlight.current = false;
			setPending(false);
		}
	}

	const saveSettings = (changes: ProjectSettingsUpdate) =>
		run(() => update({ projectSlug, changes }));
	const restoreProject = () => run(() => restore({ projectSlug }));

	return { pending, error, saveSettings, restoreProject };
}
