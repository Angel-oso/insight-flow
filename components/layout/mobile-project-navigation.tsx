"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
	isProjectSectionActive,
	projectNavigation,
} from "@/components/layout/project-navigation";
import { projectPath } from "@/lib/projects";
import { cn } from "@/lib/utils";

export function MobileProjectNavigation({
	projectSlug,
}: {
	readonly projectSlug: string;
}) {
	const pathname = usePathname();

	return (
		<nav
			aria-label="Project sections"
			className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] md:hidden"
		>
			<ul className="grid grid-cols-4">
				{projectNavigation.map((item) => {
					const href = projectPath(projectSlug, item.section);
					const isActive = isProjectSectionActive(pathname, href);

					return (
						<li key={item.section}>
							<Link
								href={href}
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"flex min-h-18 min-w-11 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-center text-xs leading-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring",
									isActive
										? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
										: "font-normal text-muted-foreground",
								)}
							>
								<item.icon
									aria-hidden="true"
									className="size-5 shrink-0"
									strokeWidth={isActive ? 2.5 : 1.5}
								/>
								<span className="flex min-h-8 items-center justify-center">
									{item.label}
								</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
