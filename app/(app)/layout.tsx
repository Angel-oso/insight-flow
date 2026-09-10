"use client";

import type { ReactNode } from "react";
import { RequireAuth } from "@/components/auth/auth-guard";

export default function MainLayout({
	children,
}: {
	readonly children: ReactNode;
}) {
	return <RequireAuth>{children}</RequireAuth>;
}
