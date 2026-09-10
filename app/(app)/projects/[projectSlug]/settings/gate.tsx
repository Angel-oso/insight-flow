"use client";

import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Role } from "@/lib/auth/permissions";

/**
 * Resolves the caller's project role server-side. Renders nothing until
 * the role is known, so capability UI never flashes for non-members.
 */
export function ProjectSettingsGate({
	projectSlug,
	children,
}: {
	readonly projectSlug: string;
	readonly children: (role: Role | null) => ReactNode;
}) {
	const role = useQuery(api.projects.settings.role, { projectSlug });
	if (role === undefined) return null;
	return <>{children(role)}</>;
}
