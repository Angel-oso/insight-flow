"use client";

import * as Sentry from "@sentry/nextjs";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Fallback for any route without its own error boundary. Keeps the root
 * layout (theme, fonts) instead of dropping to global-error.tsx.
 */
export default function RootError({
	error,
	retry,
}: {
	readonly error: Error & { digest?: string };
	readonly retry: () => void;
}) {
	useEffect(() => {
		// Expected access errors (ConvexError with a message) are not bugs.
		if (!(error instanceof ConvexError)) Sentry.captureException(error);
	}, [error]);
	const message =
		error instanceof ConvexError && typeof error.data === "string"
			? error.data
			: "Something went wrong while loading this page. Try again, and if it keeps happening, reload.";
	return (
		<main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 p-6 text-center">
			<h1 className="font-heading text-2xl font-semibold">Something went wrong</h1>
			<p role="alert" className="text-sm leading-6 text-muted-foreground">{message}</p>
			{error.digest ? (
				<p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
			) : null}
			<div className="flex flex-wrap justify-center gap-2">
				<Button onClick={() => retry()}>Try again</Button>
				<Button variant="outline" nativeButton={false} render={<Link href="/" />}>Go home</Button>
			</div>
		</main>
	);
}
