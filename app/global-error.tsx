"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
	error,
	retry,
}: {
	readonly error: Error & { digest?: string };
	readonly retry: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	return (
		<html lang="en">
			<body className="flex min-h-dvh items-center justify-center bg-background p-6 font-sans text-foreground antialiased">
				<title>Something went wrong · InsightFlow</title>
				<main className="w-full max-w-md space-y-4 text-center">
					<h1 className="text-2xl font-semibold">Something went wrong</h1>
					<p role="alert" className="text-sm leading-6 text-muted-foreground">
						InsightFlow hit an unexpected error. Try again, and if it keeps
						happening, reload the page.
					</p>
					{error.digest ? (
						<p className="font-mono text-xs text-muted-foreground">
							Reference: {error.digest}
						</p>
					) : null}
					<button
						type="button"
						onClick={() => retry()}
						className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
					>
						Try again
					</button>
				</main>
			</body>
		</html>
	);
}
