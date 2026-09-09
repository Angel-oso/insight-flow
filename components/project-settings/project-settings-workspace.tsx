"use client";

import {
	Archive,
	Check,
	ChevronDown,
	Inbox,
	PauseCircle,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Doc } from "@/convex/_generated/dataModel";
import type { Project } from "@/lib/projects";
import { useTaxonomies } from "@/lib/taxonomy";
import { TaxonomyManager } from "./taxonomy-manager";
import {
	useProjectSettingsData,
	useProjectSettingsWrites,
} from "./use-project-settings";

type ProjectStatus = Doc<"projects">["status"];
type Priority = Doc<"projects">["defaultPriority"];

type SettingsState = {
	readonly name: string;
	readonly description: string;
	readonly status: ProjectStatus;
	readonly inboxEnabled: boolean;
	readonly defaultPriority: Priority;
};

function fromProject(project: Doc<"projects">): SettingsState {
	return {
		name: project.name,
		description: project.description,
		status: project.status,
		inboxEnabled: project.inboxEnabled,
		defaultPriority: project.defaultPriority,
	};
}

function SettingToggle({
	checked,
	description,
	label,
	onPressedChange,
	disabled,
}: {
	readonly checked: boolean;
	readonly description: string;
	readonly label: string;
	readonly onPressedChange: (checked: boolean) => void;
	readonly disabled?: boolean;
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
				onClick={() => onPressedChange(!checked)}
				disabled={disabled}
			>
				{checked ? <Check data-icon="inline-start" /> : null}
				{checked ? "Enabled" : "Disabled"}
			</Button>
		</div>
	);
}

function PriorityMenu({
	priority,
	priorities,
	onPriorityChange,
	disabled,
}: {
	readonly priority: Priority;
	readonly priorities: readonly string[];
	readonly onPriorityChange: (priority: Priority) => void;
	readonly disabled?: boolean;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button type="button" variant="outline" disabled={disabled}>
						{priority}
						<ChevronDown data-icon="inline-end" />
					</Button>
				}
			/>
			<DropdownMenuContent className="w-40" align="end">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Default priority</DropdownMenuLabel>
					{priorities.map((candidate) => (
						<DropdownMenuItem
							key={candidate}
							onClick={() => onPriorityChange(candidate as Priority)}
						>
							{candidate}
							{candidate === priority ? (
								<Check className="ml-auto size-3.5" />
							) : null}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function ProjectSettingsWorkspace({
	canManage,
	project,
}: {
	readonly canManage: boolean;
	readonly project: Project;
}) {
	const data = useProjectSettingsData(project.slug);
	const { pending, error, saveSettings } = useProjectSettingsWrites(project.slug);
	const taxonomies = useTaxonomies();
	const [draft, setDraft] = useState<SettingsState | null>(null);
	const [hasSaved, setHasSaved] = useState(false);
	const [isArchiveOpen, setIsArchiveOpen] = useState(false);

	if (!data) {
		return (
			<p role="status" className="mt-7 text-muted-foreground">
				Loading settings…
			</p>
		);
	}

	const settings = draft ?? fromProject(data.project);
	const isArchived = data.project.status === "Archived";
	const canEdit = canManage && !isArchived && !pending;
	// Database priorities once loaded; static mirror only for the first paint.
	const priorityOptions =
		taxonomies?.priorities.map((item) => item.label) ??
		["Low", "Medium", "High", "Critical"];

	const updateSettings = (update: Partial<SettingsState>) => {
		setHasSaved(false);
		setDraft({ ...settings, ...update });
	};

	const handleSave = async () => {
		if (!canManage || isArchived) return;
		if (
			await saveSettings({
				name: settings.name,
				description: settings.description,
				status: settings.status,
				inboxEnabled: settings.inboxEnabled,
				defaultPriority: settings.defaultPriority,
			})
		) {
			setHasSaved(true);
		}
	};

	const handleArchive = async () => {
		if (
			await saveSettings({
				status: "Archived",
			})
		) {
			setDraft({ ...settings, status: "Archived" });
			setHasSaved(true);
			setIsArchiveOpen(false);
		}
	};

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				void handleSave();
			}}
			className="mt-7 space-y-6"
		>
			{isArchived ? (
				<section className="flex flex-col gap-3 rounded-xl bg-dashboard-warning-soft p-5 text-dashboard-warning-foreground ring-1 ring-dashboard-warning/25 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="font-semibold">This project is archived.</p>
						<p className="mt-1 text-sm leading-6">
							Feedback intake and configuration changes are paused for this
							project.
						</p>
					</div>
					<span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-current/20 px-2 py-1 text-xs font-semibold">
						<Archive className="size-3.5" /> Archived
					</span>
				</section>
			) : null}
			{error ? (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			) : null}

			<Card className="gap-0 py-0 shadow-none">
				<CardHeader className="border-b px-5 py-5 sm:px-6">
					<CardTitle>General</CardTitle>
					<CardDescription>
						The project identity shown to its team and feedback contributors.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5 px-5 py-5 sm:px-6">
					<label
						htmlFor="settings-project-name"
						className="grid gap-2 text-sm font-medium"
					>
						Project name
						<Input
							id="settings-project-name"
							value={settings.name}
							maxLength={80}
							onChange={(event) =>
								updateSettings({ name: event.target.value })
							}
							disabled={!canEdit}
						/>
					</label>
					<label
						htmlFor="settings-project-description"
						className="grid gap-2 text-sm font-medium"
					>
						Description
						<Textarea
							id="settings-project-description"
							value={settings.description}
							maxLength={500}
							onChange={(event) =>
								updateSettings({ description: event.target.value })
							}
							disabled={!canEdit}
						/>
					</label>
					<div className="grid gap-2 text-sm font-medium">
						<span>Project status</span>
						<div className="flex flex-wrap gap-2">
							{(["Active", "Paused"] as const).map((status) => (
								<Button
									key={status}
									type="button"
									variant={
										settings.status === status ? "secondary" : "outline"
									}
									aria-pressed={settings.status === status}
									onClick={() => updateSettings({ status })}
									disabled={!canEdit}
								>
									{status === "Paused" ? (
										<PauseCircle data-icon="inline-start" />
									) : null}
									{status}
								</Button>
							))}
						</div>
						<p className="text-sm font-normal leading-6 text-muted-foreground">
							Paused projects retain their history but stop accepting new
							feedback.
						</p>
					</div>
				</CardContent>
			</Card>

			<Card className="gap-0 py-0 shadow-none">
				<CardHeader className="border-b px-5 py-5 sm:px-6">
					<CardTitle>Feedback intake</CardTitle>
					<CardDescription>
						Set the default conditions for feedback that enters this project.
					</CardDescription>
				</CardHeader>
				<CardContent className="divide-y px-5 py-5 sm:px-6">
					<SettingToggle
						label="Accept feedback"
						description="Keep the project inbox available to receive new feedback. Pausing it preserves existing history."
						checked={settings.inboxEnabled}
						onPressedChange={(inboxEnabled) => updateSettings({ inboxEnabled })}
						disabled={!canEdit}
					/>
					<div className="flex flex-col gap-3 py-4 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-sm font-medium">Default priority</p>
							<p className="mt-1 text-sm leading-6 text-muted-foreground">
								New feedback starts here unless its source includes a priority.
							</p>
						</div>
						<PriorityMenu
							priority={settings.defaultPriority}
							priorities={priorityOptions}
							onPriorityChange={(defaultPriority) =>
								updateSettings({ defaultPriority })
							}
							disabled={!canEdit}
						/>
					</div>
				</CardContent>
			</Card>

			<TaxonomyManager disabled={!canEdit} />

			<Card className="gap-0 py-0 shadow-none ring-destructive/20">
				<CardHeader className="border-b px-5 py-5 sm:px-6">
					<CardTitle>Archive project</CardTitle>
					<CardDescription>
						Archive stops new feedback and configuration changes while retaining
						the project history.
					</CardDescription>
				</CardHeader>
				<CardFooter className="justify-between gap-4 px-5 py-4 sm:px-6">
					<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
						Existing feedback, team history, and project data remain available
						for review. Deletion is intentionally not part of the MVP.
					</p>
					<Button
						type="button"
						variant="destructive"
						onClick={() => setIsArchiveOpen(true)}
						disabled={!canEdit}
					>
						Archive project
					</Button>
				</CardFooter>
			</Card>

			<div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-sm text-muted-foreground">
					{hasSaved
						? "Saved · Changes are live."
						: "Changes apply after you save them."}
				</p>
				<Button type="submit" size="lg" disabled={!canEdit}>
					<Inbox data-icon="inline-start" />
					{pending ? "Saving…" : "Save project settings"}
				</Button>
			</div>

			<Sheet open={isArchiveOpen} onOpenChange={setIsArchiveOpen}>
				<SheetContent side="right" className="w-full sm:max-w-md">
					<SheetHeader>
						<SheetTitle>Archive {settings.name}?</SheetTitle>
						<SheetDescription>
							The project will stop accepting new feedback and its settings will
							be locked.
						</SheetDescription>
					</SheetHeader>
					<div className="px-4 py-2 text-sm leading-6 text-muted-foreground">
						Existing feedback, team history, and project data remain available
						for review.
					</div>
					<SheetFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsArchiveOpen(false)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={pending}
							onClick={() => void handleArchive()}
						>
							{pending ? "Archiving…" : "Archive project"}
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</form>
	);
}
