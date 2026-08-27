"use client";

import {
	Archive,
	BellRing,
	Check,
	ChevronDown,
	Copy,
	ExternalLink,
	Inbox,
	PauseCircle,
	ShieldCheck,
	UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
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
import type { Project } from "@/lib/projects";
import { projectPath } from "@/lib/projects";

type ProjectStatus = "Active" | "Paused" | "Archived";
type Priority = "Low" | "Medium" | "High" | "Critical";

type SettingsState = {
	readonly name: string;
	readonly description: string;
	readonly status: ProjectStatus;
	readonly inboxEnabled: boolean;
	readonly defaultPriority: Priority;
	readonly criticalAlerts: boolean;
	readonly weeklyDigest: boolean;
};

const settingsStorageKey = "insightflow-project-settings";

function createDefaultSettings(project: Project): SettingsState {
	return {
		name: project.name,
		description: project.description,
		status: "Active",
		inboxEnabled: true,
		defaultPriority: "Medium",
		criticalAlerts: true,
		weeklyDigest: true,
	};
}

function loadSettings(project: Project): SettingsState {
	if (typeof window === "undefined") return createDefaultSettings(project);

	return readStoredSettings()[project.slug] ?? createDefaultSettings(project);
}

function readStoredSettings() {
	try {
		return JSON.parse(
			window.localStorage.getItem(settingsStorageKey) ?? "{}",
		) as Record<string, SettingsState>;
	} catch {
		return {};
	}
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
	onPriorityChange,
	disabled,
}: {
	readonly priority: Priority;
	readonly onPriorityChange: (priority: Priority) => void;
	readonly disabled?: boolean;
}) {
	const priorities: readonly Priority[] = ["Low", "Medium", "High", "Critical"];

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
							onClick={() => onPriorityChange(candidate)}
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
	memberCount,
}: {
	readonly canManage: boolean;
	readonly project: Project;
	readonly memberCount: number;
}) {
	const [settings, setSettings] = useState<SettingsState>(() =>
		loadSettings(project),
	);
	const [hasSaved, setHasSaved] = useState(false);
	const [hasCopiedInboxUrl, setHasCopiedInboxUrl] = useState(false);
	const [isArchiveOpen, setIsArchiveOpen] = useState(false);
	const isArchived = settings.status === "Archived";
	const inboxUrl = `insightflow.app/feedback/${project.slug}`;

	const updateSettings = (update: Partial<SettingsState>) => {
		setHasSaved(false);
		setSettings((currentSettings) => ({ ...currentSettings, ...update }));
	};

	const saveSettings = () => {
		if (!canManage || isArchived) return;

		const storedSettings = readStoredSettings();
		window.localStorage.setItem(
			settingsStorageKey,
			JSON.stringify({ ...storedSettings, [project.slug]: settings }),
		);
		setHasSaved(true);
	};

	const archiveProject = () => {
		const archivedSettings = { ...settings, status: "Archived" as const };
		setSettings(archivedSettings);
		window.localStorage.setItem(
			settingsStorageKey,
			JSON.stringify({
				...readStoredSettings(),
				[project.slug]: archivedSettings,
			}),
		);
		setHasSaved(true);
		setIsArchiveOpen(false);
	};

	const canEdit = canManage && !isArchived;
	const copyInboxUrl = async () => {
		try {
			await navigator.clipboard.writeText(`https://${inboxUrl}`);
			setHasCopiedInboxUrl(true);
		} catch {
			setHasCopiedInboxUrl(false);
		}
	};

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				saveSettings();
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

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
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

				<div className="space-y-6">
					<Card className="gap-0 py-0 shadow-none">
						<CardHeader className="border-b px-5 py-5">
							<CardTitle>Project access</CardTitle>
							<CardDescription>
								People assigned to this project can work within its scope.
							</CardDescription>
							<CardAction>
								<UsersRound className="size-4 text-dashboard-primary" />
							</CardAction>
						</CardHeader>
						<CardContent className="p-5">
							<p className="font-heading text-2xl font-semibold tabular-nums">
								{memberCount}
							</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Active members
							</p>
							<Button
								variant="outline"
								size="sm"
								className="mt-4"
								nativeButton={false}
								render={<Link href={projectPath(project.slug, "team")} />}
							>
								Manage project access <ExternalLink data-icon="inline-end" />
							</Button>
						</CardContent>
					</Card>

					<Card className="gap-0 py-0 shadow-none">
						<CardHeader className="border-b px-5 py-5">
							<CardTitle>Admin scope</CardTitle>
							<CardDescription>
								This view is available only to administrators of the project.
							</CardDescription>
							<CardAction>
								<ShieldCheck className="size-4 text-dashboard-success" />
							</CardAction>
						</CardHeader>
						<CardContent className="p-5 text-sm leading-6 text-muted-foreground">
							Managers can coordinate feedback; members can update their
							assigned work. Only Admin can change project policy and archive
							it.
						</CardContent>
					</Card>
				</div>
			</div>

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
					<div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-sm font-medium">Public inbox link</p>
							<p className="mt-1 text-sm leading-6 text-muted-foreground">
								Use this project-specific link when the public feedback form is
								connected.
							</p>
						</div>
						<div className="flex min-w-0 items-center gap-2 sm:max-w-sm">
							<Input aria-label="Public inbox link" value={inboxUrl} readOnly />
							<Button
								type="button"
								variant="outline"
								size={hasCopiedInboxUrl ? "sm" : "icon"}
								disabled={!canEdit}
								onClick={copyInboxUrl}
							>
								{hasCopiedInboxUrl ? (
									<>
										<Check data-icon="inline-start" /> Copied
									</>
								) : (
									<>
										<Copy />
										<span className="sr-only">Copy public inbox link</span>
									</>
								)}
							</Button>
						</div>
					</div>
					<div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-sm font-medium">Default priority</p>
							<p className="mt-1 text-sm leading-6 text-muted-foreground">
								New feedback starts here unless its source includes a priority.
							</p>
						</div>
						<PriorityMenu
							priority={settings.defaultPriority}
							onPriorityChange={(defaultPriority) =>
								updateSettings({ defaultPriority })
							}
							disabled={!canEdit}
						/>
					</div>
					<div className="py-4 last:pb-0">
						<p className="text-sm font-medium">Categories in this project</p>
						<p className="mt-1 text-sm leading-6 text-muted-foreground">
							The MVP keeps one shared category taxonomy so reporting stays
							comparable across projects.
						</p>
						<div className="mt-3 flex flex-wrap gap-2">
							{[
								"Bug",
								"Feature request",
								"Improvement",
								"Question",
								"Other",
							].map((category) => (
								<span
									key={category}
									className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
								>
									{category}
								</span>
							))}
						</div>
					</div>
				</CardContent>
			</Card>

			<Card className="gap-0 py-0 shadow-none">
				<CardHeader className="border-b px-5 py-5 sm:px-6">
					<CardTitle>Notifications</CardTitle>
					<CardDescription>
						Keep project owners informed without turning routine activity into
						noise.
					</CardDescription>
					<CardAction>
						<BellRing className="size-4 text-dashboard-info" />
					</CardAction>
				</CardHeader>
				<CardContent className="divide-y px-5 py-5 sm:px-6">
					<SettingToggle
						label="Critical feedback alerts"
						description="Notify project owners when critical feedback arrives or remains without an owner."
						checked={settings.criticalAlerts}
						onPressedChange={(criticalAlerts) =>
							updateSettings({ criticalAlerts })
						}
						disabled={!canEdit}
					/>
					<SettingToggle
						label="Weekly project digest"
						description="Send a weekly summary of received, open, and overdue feedback to project administrators."
						checked={settings.weeklyDigest}
						onPressedChange={(weeklyDigest) => updateSettings({ weeklyDigest })}
						disabled={!canEdit}
					/>
				</CardContent>
			</Card>

			<Card className="gap-0 py-0 shadow-none ring-destructive/20">
				<CardHeader className="border-b px-5 py-5 sm:px-6">
					<CardTitle>Archive project</CardTitle>
					<CardDescription>
						Archive stops new feedback and configuration changes while retaining
						the project history.
					</CardDescription>
					<CardAction>
						<Archive className="size-4 text-destructive" />
					</CardAction>
				</CardHeader>
				<CardFooter className="justify-between gap-4 px-5 py-4 sm:px-6">
					<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
						This can be reversed when the project is backed by workspace data.
						Deletion is intentionally not part of the MVP.
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
						? "Saved in this demo workspace."
						: "Changes apply after you save them."}
				</p>
				<Button type="submit" size="lg" disabled={!canEdit}>
					<Inbox data-icon="inline-start" />
					Save project settings
				</Button>
			</div>

			<Sheet open={isArchiveOpen} onOpenChange={setIsArchiveOpen}>
				<SheetContent side="right" className="w-full sm:max-w-md">
					<SheetHeader>
						<SheetTitle>Archive {project.name}?</SheetTitle>
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
							onClick={archiveProject}
						>
							Archive project
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</form>
	);
}
