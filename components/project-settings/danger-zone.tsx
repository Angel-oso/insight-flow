"use client";

import { useMutation } from "convex/react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Project } from "@/lib/projects";

/** Project deletion for organization administrators (typed-name confirm). */
export function ProjectDangerZone({ project }: { readonly project: Project }) {
	const router = useRouter();
	const remove = useMutation(api.projects.deletion.remove);
	const [open, setOpen] = useState(false);

	return (
		<Card className="mt-6 ring-destructive/25">
			<CardHeader>
				<CardTitle className="text-destructive">Danger zone</CardTitle>
				<CardDescription>
					Deleting a project closes its public feedback link and hides it from everyone at once.
					Organization administrators can restore it from organization settings for 7 days;
					after that its feedback, internal notes, activity, members and invitation links are
					permanently removed. To keep the history read-only instead, archive the project.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button variant="destructive" onClick={() => setOpen(true)}>
					<Trash2 data-icon="inline-start" />
					Delete project
				</Button>
			</CardContent>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title={`Delete ${project.name}?`}
				description="The project disappears for everyone right away. Organization administrators can restore it from organization settings for 7 days; after that its data is permanently deleted."
				confirmLabel="Delete project"
				pendingLabel="Deleting…"
				confirmText={project.name}
				onConfirm={async (typed) => {
					await remove({ projectSlug: project.slug, confirmName: typed });
					router.replace("/workspace");
				}}
			/>
		</Card>
	);
}
