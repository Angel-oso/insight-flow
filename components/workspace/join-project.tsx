"use client";

import { useMutation } from "convex/react";
import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { projectPath } from "@/lib/projects";

/** Lets an organization administrator enter a project they are not part of. */
export function JoinProject({ organizationId, projectSlug, projectName }: {
	readonly organizationId: Id<"organizations">;
	readonly projectSlug: string;
	readonly projectName: string;
}) {
	const join = useMutation(api.organizations.members.joinProject);
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function run() {
		setBusy(true);
		setError(null);
		try {
			const { projectSlug: slug } = await join({ organizationId, projectSlug });
			router.push(projectPath(slug, "home"));
		} catch (cause) {
			setError(errorMessage(cause, "Could not join this project. Try again."));
			setBusy(false);
		}
	}
	return <span className="inline-flex flex-col items-start gap-1">
		<Button size="sm" variant="outline" disabled={busy} aria-label={`Join ${projectName} as an administrator`} onClick={() => void run()}>
			<LogIn data-icon="inline-start" />{busy ? "Joining…" : "Join as admin"}
		</Button>
		{error ? <span role="alert" className="text-xs font-normal text-destructive">{error}</span> : null}
	</span>;
}
