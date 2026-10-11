"use client";

import { useQuery } from "convex/react";
import { parseAsString, useQueryState } from "nuqs";
import { api } from "@/convex/_generated/api";

/** URL selection is resolved against memberships before any organization query. */
export function useOrganization() {
	const [selectedId, setSelectedId] = useQueryState("organization", parseAsString.withDefault(""));
	const organizations = useQuery(api.organizations.queries.mine, {});
	const projects = useQuery(api.projects.queries.list, {});
	const firstProject = projects?.[0];
	const defaultId = useQuery(api.organizations.queries.organizationForProject, firstProject ? { projectSlug: firstProject.slug } : "skip");
	const loading = organizations === undefined || projects === undefined || (!selectedId && firstProject !== undefined && defaultId === undefined);
	const organization = selectedId
		? organizations?.find((org) => org.id === selectedId)
		: organizations?.find((org) => org.id === defaultId) ?? organizations?.[0];
	return { organization: loading ? undefined : organization, organizations, loading, setOrganization: (id: string) => void setSelectedId(id) };
}
