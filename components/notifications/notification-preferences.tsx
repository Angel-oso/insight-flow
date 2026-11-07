"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { BellOff, Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/convex/_generated/api";

type Kind = "criticalAlerts" | "weeklyDigest";

function PreferenceRow({
	label,
	description,
	checked,
	disabled,
	onChange,
}: {
	readonly label: string;
	readonly description: string;
	readonly checked: boolean;
	readonly disabled: boolean;
	readonly onChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-start justify-between gap-5 py-4 first:pt-0 last:pb-0">
			<div>
				<p className="text-sm font-medium">{label}</p>
				<p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
					{description}
				</p>
			</div>
			<Button
				type="button"
				size="sm"
				variant={checked ? "secondary" : "outline"}
				aria-pressed={checked}
				aria-label={`${label}: ${checked ? "on" : "off"}`}
				onClick={() => onChange(!checked)}
				disabled={disabled}
			>
				{checked ? <Check data-icon="inline-start" /> : <BellOff data-icon="inline-start" />}
				{checked ? "On" : "Off"}
			</Button>
		</div>
	);
}

/**
 * The signed-in member's own email preferences for one project. Separate
 * from the project-wide switches admins control; both must be on.
 */
export function NotificationPreferences({ projectSlug }: { readonly projectSlug: string }) {
	const preferences = useQuery(api.notifications.preferences.get, { projectSlug });
	const update = useMutation(api.notifications.preferences.update);
	const [pending, setPending] = useState<Kind | null>(null);
	const [error, setError] = useState<string | null>(null);

	if (!preferences) return null;

	const save = async (kind: Kind, value: boolean) => {
		if (pending) return;
		setPending(kind);
		setError(null);
		try {
			await update(
				kind === "criticalAlerts"
					? { projectSlug, criticalAlerts: value }
					: { projectSlug, weeklyDigest: value },
			);
		} catch (cause) {
			setError(
				cause instanceof ConvexError && typeof cause.data === "string"
					? cause.data
					: "Could not save your notification settings. Please try again.",
			);
		} finally {
			setPending(null);
		}
	};

	const offNote = (on: boolean) => (on ? "" : " A project admin has turned this off for everyone.");
	let status: string | null = null;
	if (!preferences.canTriage)
		status = "These emails go to members who can triage feedback. Your role doesn't include triage, so you won't receive them.";
	else if (!preferences.emailVerified)
		status = "Verify your email address to receive notification emails.";
	else if (preferences.suppressed)
		status = "Emails to your address bounced or were reported as spam, so notifications are paused. Change your sign-in email to resume them.";

	return (
		<Card className="gap-0 py-0 shadow-none">
			<CardHeader className="border-b px-5 py-5 sm:px-6">
				<CardTitle>Your email notifications</CardTitle>
				<CardDescription>
					Choose which emails you receive for this project. Every email also
					has a one-click unsubscribe link.
				</CardDescription>
			</CardHeader>
			<CardContent className="divide-y px-5 py-5 sm:px-6">
				{status ? (
					<p role="status" className="pb-4 text-sm leading-6 text-muted-foreground">
						{status}
					</p>
				) : null}
				{error ? (
					<p role="alert" className="pb-4 text-sm text-destructive">
						{error}
					</p>
				) : null}
				<PreferenceRow
					label="Critical alerts"
					description={`An email when feedback reaches the top priority.${offNote(preferences.projectCriticalAlerts)}`}
					checked={preferences.criticalAlerts}
					disabled={pending !== null}
					onChange={(value) => void save("criticalAlerts", value)}
				/>
				<PreferenceRow
					label="Weekly digest"
					description={`A Monday summary of the last 7 days.${offNote(preferences.projectWeeklyDigest)}`}
					checked={preferences.weeklyDigest}
					disabled={pending !== null}
					onChange={(value) => void save("weeklyDigest", value)}
				/>
			</CardContent>
		</Card>
	);
}
