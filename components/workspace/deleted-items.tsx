"use client";

import { useMutation, useQuery } from "convex/react";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { errorMessage } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const minuteMs = 60_000;
const dayMs = 86_400_000;

function remaining(purgeAt: number, now: number) {
	const days = Math.ceil((purgeAt - now) / dayMs);
	if (days > 1) return `${days} days left to restore`;
	const hours = Math.max(1, Math.ceil((purgeAt - now) / 3_600_000));
	return hours === 1 ? "Less than an hour left to restore" : `${hours} hours left to restore`;
}

/** Client clock rounded to the minute (queries never read the clock). */
function useMinuteClock() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), minuteMs);
		return () => clearInterval(timer);
	}, []);
	return now;
}

type Row = { id: string; name: string; purgeAt: number };

function DeletedList({
	title,
	description,
	rows,
	now,
	onRestore,
}: {
	readonly title: string;
	readonly description: string;
	readonly rows: readonly Row[];
	readonly now: number;
	readonly onRestore: (id: string) => Promise<void>;
}) {
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [restored, setRestored] = useState<string | null>(null);
	const visible = rows.filter((row) => row.purgeAt > now);
	if (visible.length === 0 && !restored) return null;
	return (
		<Card className="gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="border-b px-5 py-5">
				<h2 className="font-heading text-lg font-semibold">{title}</h2>
				<p className="text-sm text-muted-foreground">{description}</p>
			</CardHeader>
			<CardContent className="divide-y p-0">
				{restored ? <p role="status" className="px-5 py-3 text-sm text-dashboard-success">{restored} was restored.</p> : null}
				{error ? <p role="alert" className="px-5 py-3 text-sm text-destructive">{error}</p> : null}
				{visible.map((row) => (
					<div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
						<div className="min-w-0 text-sm">
							<p className="truncate font-medium">{row.name}</p>
							<p className="text-xs text-muted-foreground">{remaining(row.purgeAt, now)}</p>
						</div>
						<Button
							size="sm"
							variant="outline"
							disabled={busy !== null}
							onClick={async () => {
								setBusy(row.id); setError(null); setRestored(null);
								try {
									await onRestore(row.id);
									setRestored(row.name);
								} catch (cause) {
									setError(errorMessage(cause, `Could not restore ${row.name}. Try again.`));
								} finally {
									setBusy(null);
								}
							}}
						>
							<RotateCcw data-icon="inline-start" />
							{busy === row.id ? "Restoring…" : "Restore"}
						</Button>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

/** Projects of this organization deleted within the last 7 days (admins). */
export function DeletedProjects({ organizationId }: { readonly organizationId: Id<"organizations"> }) {
	const now = useMinuteClock();
	const projects = useQuery(api.projects.deletion.deleted, { organizationId });
	const restore = useMutation(api.projects.deletion.restore);
	if (!projects) return null;
	return (
		<DeletedList
			title="Recently deleted projects"
			description="Deleted projects can be restored for 7 days with their feedback, members and settings. After that they are permanently removed."
			rows={projects}
			now={now}
			onRestore={async (id) => {
				await restore({ projectId: id as Id<"projects"> });
			}}
		/>
	);
}

/** Organizations the signed-in user owns that were deleted within 7 days. */
export function DeletedOrganizations() {
	const now = useMinuteClock();
	const organizations = useQuery(api.organizations.deletion.deleted, {});
	const restore = useMutation(api.organizations.deletion.restore);
	if (!organizations) return null;
	return (
		<DeletedList
			title="Recently deleted organizations"
			description="Organizations you deleted can be restored for 7 days, together with their projects. After that they are permanently removed."
			rows={organizations}
			now={now}
			onRestore={async (id) => {
				await restore({ organizationId: id as Id<"organizations"> });
			}}
		/>
	);
}
