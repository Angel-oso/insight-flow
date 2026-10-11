"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useCurrentProject } from "./project-context";

export function CurrentProjectShell({ children }: { readonly children: ReactNode }) {
	const project = useCurrentProject();
	return <AppShell project={project}>{children}</AppShell>;
}
