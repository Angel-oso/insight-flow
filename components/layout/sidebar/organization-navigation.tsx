"use client";

import { useQuery } from "convex/react";
import { Building2, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { api } from "@/convex/_generated/api";
import { sidebarItemClass } from "./sidebar-item";

/**
 * The organization tier. Inside a project it follows that project's
 * organization; on /workspace it follows the selected one.
 */
export function OrganizationNavigation({ projectSlug }: { readonly projectSlug?: string }) {
	const pathname = usePathname();
	const [selectedId] = useQueryState("organization", parseAsString);
	const organizations = useQuery(api.organizations.queries.mine, {});
	const projectOrganizationId = useQuery(
		api.organizations.queries.organizationForProject,
		projectSlug ? { projectSlug } : "skip",
	);
	const organizationId = projectOrganizationId ?? selectedId;
	const organization =
		organizations?.find((candidate) => candidate.id === organizationId) ?? organizations?.[0];
	const query = organization ? `?organization=${organization.id}` : "";

	const items = [
		{ label: "Workspace", icon: Building2, href: `/workspace${query}`, active: pathname === "/workspace" },
		...(organization?.isAdmin
			? [{
				label: "Organization settings",
				icon: Settings2,
				href: `/workspace/settings${query}`,
				active: pathname.startsWith("/workspace/settings"),
			}]
			: []),
	];

	return (
		<SidebarGroup>
			<SidebarGroupLabel title={organization?.name}>
				<span className="truncate">{organization?.name ?? "Organization"}</span>
			</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					{items.map((item) => (
						<SidebarMenuItem key={item.label}>
							<SidebarMenuButton
								isActive={item.active}
								tooltip={item.label}
								className={sidebarItemClass}
								render={<Link href={item.href} aria-current={item.active ? "page" : undefined} />}
							>
								<item.icon />
								<span>{item.label}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
