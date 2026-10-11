"use client";

import { Suspense, type ReactNode } from "react";
import { RequireAuth } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/layout/app-shell";

export default function WorkspaceLayout({ children }: { readonly children: ReactNode }) {
	return <Suspense fallback={<p role="status" className="p-8 text-sm text-muted-foreground">Loading workspace…</p>}>
		<RequireAuth><AppShell>{children}</AppShell></RequireAuth>
	</Suspense>;
}
