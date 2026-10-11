"use client";

import { Check, ChevronsUpDown, FolderKanban, Plus } from "lucide-react";
import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
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
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { api } from "@/convex/_generated/api";
import { type Project, projectPath } from "@/lib/projects";

function normalizeProjectName(value: string) {
	return value.trim().replace(/\s+/g, " ");
}

function slugify(value: string) {
	return normalizeProjectName(value)
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

function getCurrentSection(pathname: string) {
	const section = pathname.split("/").filter(Boolean).at(-1);
	return section === "feedback" || section === "team" || section === "settings"
		? section
		: "home";
}

export function ProjectSwitcher({ project }: { readonly project?: Project }) {
	const pathname = usePathname();
	const router = useRouter();
	const projects = useQuery(api.projects.queries.list, {});
	const create = useMutation(api.projects.mutations.create);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [projectName, setProjectName] = useState("");
	const [description, setDescription] = useState("");
	const [createError, setCreateError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const section = getCurrentSection(pathname);

	const availableProjects = projects ?? [];

	const selectProject = (projectSlug: string) => {
		router.push(projectPath(projectSlug, section));
	};

	const createProject = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const name = normalizeProjectName(projectName);
		if (!project || !name || !slugify(name)) return;

		setIsCreating(true);
		setCreateError(null);
		try {
			const createdProject = await create({ currentProjectSlug: project.slug, name, description });
			setIsCreateOpen(false);
			setProjectName("");
			setDescription("");
			selectProject(createdProject.slug);
		} catch (cause) {
			setCreateError(
				cause instanceof ConvexError
					? cause.message
					: "Could not create the project. Try again.",
			);
		} finally {
			setIsCreating(false);
		}
	};

	return (
		<>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								tooltip="Change project"
								className="aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
							/>
						}
					>
						<span className="grid aspect-square size-8 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
							<FolderKanban className="size-4" />
						</span>
						<span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
							<span className="truncate font-heading font-semibold tracking-[-0.02em]">
								{project?.name ?? "Select a project"}
							</span>
							<span className="truncate text-xs text-sidebar-foreground/70">
								InsightFlow
							</span>
						</span>
						<ChevronsUpDown className="size-4" />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="min-w-64 rounded-lg" align="start">
						<DropdownMenuGroup>
							<DropdownMenuLabel>Projects</DropdownMenuLabel>
							{availableProjects.length === 0 ? (
								<DropdownMenuItem disabled>
									{projects === undefined ? "Loading projects…" : "No projects available"}
								</DropdownMenuItem>
							) : null}
							{availableProjects.map((candidate) => (
								<DropdownMenuItem
									key={candidate.slug}
									onClick={() => selectProject(candidate.slug)}
									className="gap-2 p-2"
								>
									<span className="grid size-6 place-items-center rounded-md border bg-muted/50">
										<FolderKanban className="size-3.5" />
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium">
											{candidate.name}
										</span>
										<span className="block truncate text-xs text-muted-foreground">
											{candidate.description}
										</span>
									</span>
									{candidate.slug === project?.slug ? (
										<Check
											className="size-4 text-primary"
											aria-label="Current project"
										/>
									) : null}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							disabled={!project}
							onClick={() => setIsCreateOpen(true)}
							className="gap-2 p-2"
						>
							<span className="grid size-6 place-items-center rounded-md border bg-transparent">
								<Plus className="size-4" />
							</span>
							<span className="font-medium">Create project</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>

			<Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<SheetContent side="right" className="w-full sm:max-w-md">
					<form className="flex min-h-full flex-col" onSubmit={createProject}>
						<SheetHeader>
							<SheetTitle>Create project</SheetTitle>
							<SheetDescription>
								Set up a new project context for feedback, members, and
								reporting.
							</SheetDescription>
						</SheetHeader>
						<div className="space-y-5 px-4 py-2">
							<label
								htmlFor="project-name"
								className="grid gap-2 text-sm font-medium"
							>
								Project name
								<Input
									id="project-name"
									autoFocus
									value={projectName}
									onChange={(event) => setProjectName(event.target.value)}
									placeholder="e.g. Partner portal"
									required
								/>
							</label>
							<label
								htmlFor="project-description"
								className="grid gap-2 text-sm font-medium"
							>
								Description{" "}
								<span className="font-normal text-muted-foreground">
									Optional
								</span>
								<Input
									id="project-description"
									value={description}
									onChange={(event) => setDescription(event.target.value)}
									placeholder="What is this project for?"
								/>
							</label>
							{createError ? (
								<p role="alert" className="text-sm text-destructive">
									{createError}
								</p>
							) : null}
						</div>
						<SheetFooter>
							<Button type="submit" disabled={isCreating}>
								{isCreating ? "Creating project…" : "Create and open project"}
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>
		</>
	);
}
