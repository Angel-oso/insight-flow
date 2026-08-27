"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TeamSwitcher({
	teams,
	activeTeamIndex: activeTeamIndexProp,
	onTeamChange,
}: {
	readonly teams: { name: string; logo: React.ElementType; plan: string }[];
	readonly activeTeamIndex?: number;
	readonly onTeamChange?: (index: number) => void;
}) {
	const [uncontrolledActiveTeamIndex, setUncontrolledActiveTeamIndex] =
		React.useState(0);
	const activeTeamIndex = activeTeamIndexProp ?? uncontrolledActiveTeamIndex;
	const activeTeam = teams[activeTeamIndex];

	function selectTeam(index: number) {
		if (activeTeamIndexProp === undefined) {
			setUncontrolledActiveTeamIndex(index);
		}
		onTeamChange?.(index);
	}

	if (!activeTeam) {
		return null;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="ghost" className="h-10 min-w-0 w-full gap-2 px-2" />
				}
			>
				<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
					<activeTeam.logo className="size-4" />
				</div>
				<div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
					<span className="truncate font-medium">{activeTeam.name}</span>
					<span className="truncate text-xs">{activeTeam.plan}</span>
				</div>
				<ChevronsUpDown className="size-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-56 rounded-lg" align="start">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="text-xs text-muted-foreground">
						Teams
					</DropdownMenuLabel>
					{teams.map((team, index) => (
						<DropdownMenuItem
							key={team.name}
							onClick={() => selectTeam(index)}
							className="gap-2 p-2"
						>
							<div className="flex size-6 items-center justify-center rounded-md border">
								<team.logo className="size-3.5 shrink-0" />
							</div>
							{team.name}
							<DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem className="gap-2 p-2">
					<div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
						<Plus className="size-4" />
					</div>
					<div className="font-medium text-muted-foreground">Add team</div>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
