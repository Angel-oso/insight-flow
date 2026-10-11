"use client";

import { useConvexAuth } from "convex/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LandingActions({ compact = false }: { readonly compact?: boolean }) {
	const { isLoading, isAuthenticated } = useConvexAuth();

	if (isLoading) {
		return <span role="status" className="text-sm text-muted-foreground">Checking session…</span>;
	}

	if (isAuthenticated) {
		return (
			<Button
				nativeButton={false}
				render={<Link href="/home" />}
				size="lg"
				className="bg-dashboard-primary px-4 text-primary-foreground hover:bg-dashboard-primary/90"
			>
				Open workspace <ArrowRight aria-hidden="true" />
			</Button>
		);
	}

	if (compact) {
		return <Button nativeButton={false} render={<Link href="/login" />} variant="outline" size="lg">Sign in</Button>;
	}

	return (
		<div className="flex flex-wrap items-center gap-3">
			<Button
				nativeButton={false}
				render={<Link href="/signup" />}
				size="lg"
				className="bg-dashboard-primary px-4 text-primary-foreground hover:bg-dashboard-primary/90"
			>
				Create an account <ArrowRight aria-hidden="true" />
			</Button>
			<Button nativeButton={false} render={<Link href="/login" />} variant="outline" size="lg" className="px-4">
				Sign in
			</Button>
		</div>
	);
}
