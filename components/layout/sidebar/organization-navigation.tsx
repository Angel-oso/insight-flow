"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function OrganizationNavigation({ projectSlug }: { readonly projectSlug?: string }) {
	const pathname = usePathname();
	const organizationId = useQuery(api.organizations.queries.organizationForProject, projectSlug ? { projectSlug } : "skip");
	const active = pathname.startsWith("/workspace");
	return <SidebarGroup><SidebarGroupContent><SidebarMenu><SidebarMenuItem>
		<SidebarMenuButton isActive={active} tooltip="Workspace" render={<Link href={organizationId ? `/workspace?organization=${organizationId}` : "/workspace"} aria-current={active ? "page" : undefined} />}>
			<Building2 /><span>Workspace</span>
		</SidebarMenuButton>
	</SidebarMenuItem></SidebarMenu></SidebarGroupContent></SidebarGroup>;
}
