"use client";

import Link from "next/link";
import { ConvexError } from "convex/values";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ error, reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
	const message = error instanceof ConvexError && typeof error.data === "string"
		? error.data
		: "Could not load this workspace. Try again or return to your default organization.";
	return <main className="mx-auto w-full max-w-2xl space-y-4 p-8">
		<h1 className="font-heading text-2xl font-semibold">Workspace unavailable</h1>
		<p role="alert" className="text-sm leading-6 text-muted-foreground">{message}</p>
		<div className="flex flex-wrap gap-2">
			<Button onClick={reset}>Try again</Button>
			<Button variant="outline" nativeButton={false} render={<Link href="/workspace" />}>Default workspace</Button>
		</div>
	</main>;
}
