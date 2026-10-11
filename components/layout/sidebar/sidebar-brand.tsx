"use client";

import { PanelLeftOpen } from "lucide-react";
import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";
import {
	SidebarTrigger,
	useSidebar,
} from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Expanded: the logo links to the workspace and the collapse toggle sits on
 * the right. Collapsed: the logo itself is the expand control; on hover or
 * keyboard focus the mark gives way to the expand icon so the action is
 * visible before it is taken.
 */
export function SidebarBrand() {
	const { state, isMobile, toggleSidebar } = useSidebar();

	if (state === "collapsed" && !isMobile) {
		return (
			<Tooltip>
				<TooltipTrigger
					render={
						<button
							type="button"
							onClick={toggleSidebar}
							aria-label="Expand sidebar"
							className="group/brand relative grid size-8 place-items-center rounded-lg outline-hidden ring-sidebar-ring focus-visible:ring-2"
						/>
					}
				>
					<LogoMark className="size-8! transition-opacity duration-150 group-hover/brand:opacity-0 group-focus-visible/brand:opacity-0" />
					<span
						aria-hidden="true"
						className="absolute inset-0 grid place-items-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground opacity-0 transition-opacity duration-150 group-hover/brand:opacity-100 group-focus-visible/brand:opacity-100"
					>
						<PanelLeftOpen className="size-4" />
					</span>
				</TooltipTrigger>
				<TooltipContent side="right">Expand sidebar</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<div className="flex h-8 items-center justify-between gap-2">
			<Link
				href="/workspace"
				aria-label="InsightFlow workspace"
				className="flex min-w-0 items-center gap-2.5 rounded-md outline-hidden ring-sidebar-ring focus-visible:ring-2"
			>
				<LogoMark className="size-7! shrink-0" />
				<span className="truncate font-heading text-base font-semibold tracking-[-0.02em]">
					InsightFlow
				</span>
			</Link>
			<SidebarTrigger
				aria-label="Collapse sidebar"
				title="Collapse sidebar"
				className="hidden text-sidebar-foreground/60 hover:text-sidebar-foreground md:inline-flex"
			/>
		</div>
	);
}
