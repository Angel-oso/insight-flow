"use client";

import { Button } from "@/components/ui/button";

export default function FeedbackError({
	retry,
}: {
	readonly retry: () => void;
}) {
	return (
		<section role="alert" className="mx-auto max-w-xl space-y-4 p-8">
			<h1 className="text-xl font-semibold">Feedback is unavailable</h1>
			<p className="text-muted-foreground">
				We could not load this project. Check your connection and try again.
			</p>
			<Button onClick={retry}>Try again</Button>
		</section>
	);
}
