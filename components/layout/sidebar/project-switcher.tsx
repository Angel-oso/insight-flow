"use client";

import { Check, ChevronsUpDown, FolderKanban, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
import { type Project, projectPath, projects } from "@/lib/projects";

const customProjectsStorageKey = "insightflow-custom-projects";

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

export function ProjectSwitcher({ project }: { readonly project: Project }) {
	const pathname = usePathname();
	const router = useRouter();
	const [customProjects, setCustomProjects] = useState<Project[]>(() => {
		if (typeof window === "undefined") return [];

		try {
			return JSON.parse(
				window.localStorage.getItem(customProjectsStorageKey) ?? "[]",
			) as Project[];
		} catch {
			window.localStorage.removeItem(customProjectsStorageKey);
			return [];
		}
	});
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [projectName, setProjectName] = useState("");
	const [description, setDescription] = useState("");
	const section = getCurrentSection(pathname);

	const availableProjects = useMemo(() => {
		const allProjects = [...projects, ...customProjects];
		return allProjects.some((candidate) => candidate.slug === project.slug)
			? allProjects
			: [...allProjects, project];
	}, [customProjects, project]);

	const selectProject = (projectSlug: string) => {
		router.push(projectPath(projectSlug, section));
	};

	const createProject = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const name = normalizeProjectName(projectName);
		const slug = slugify(name);
		if (!name || !slug) return;

		const newProject = {
			slug,
			name,
			description:
				normalizeProjectName(description) || "New project workspace.",
		};
		const nextProjects = [
			...customProjects.filter((candidate) => candidate.slug !== slug),
			newProject,
		];

		setCustomProjects(nextProjects);
		window.localStorage.setItem(
			customProjectsStorageKey,
			JSON.stringify(nextProjects),
		);
		setIsCreateOpen(false);
		setProjectName("");
		setDescription("");
		selectProject(slug);
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
								{project.name}
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
									{candidate.slug === project.slug ? (
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
						</div>
						<SheetFooter>
							<Button type="submit">Create and open project</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>
		</>
	);
}
