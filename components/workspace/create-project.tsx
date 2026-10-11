"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { projectPath } from "@/lib/projects";

export function CreateProject({ organizationId, organizationName }: { readonly organizationId: Id<"organizations">; readonly organizationName: string }) {
	const create = useMutation(api.projects.mutations.create);
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	async function submit(event: FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const project = await create({ organizationId, name, description });
			setOpen(false);
			router.push(projectPath(project.slug, "home"));
		} catch (cause) {
			setError(cause instanceof ConvexError ? cause.message : "Could not create the project. Try again.");
		} finally { setBusy(false); }
	}
	return <>
		<Button size="lg" onClick={() => { setError(null); setOpen(true); }}><Plus />Create project</Button>
		<Sheet open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<form className="flex min-h-full flex-col" onSubmit={submit}>
					<SheetHeader><SheetTitle>Create project</SheetTitle><SheetDescription>Collect feedback for a new project in {organizationName}.</SheetDescription></SheetHeader>
					<div className="space-y-5 px-4 py-2">
						<label className="grid gap-2 text-sm font-medium">Project name<Input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Partner portal" disabled={busy} /></label>
						<label className="grid gap-2 text-sm font-medium">Description (optional)<Textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this project for?" disabled={busy} /></label>
						{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
					</div>
					<SheetFooter><Button type="submit" disabled={busy || !name.trim()}>{busy ? "Creating project…" : "Create and open project"}</Button></SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	</>;
}
