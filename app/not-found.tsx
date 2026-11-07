import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
	title: "Page not found · InsightFlow",
	robots: { index: false },
};

export default function NotFound() {
	return (
		<main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 p-6 text-center">
			<p className="font-mono text-sm text-muted-foreground">404</p>
			<h1 className="font-heading text-2xl font-semibold">Page not found</h1>
			<p className="text-sm leading-6 text-muted-foreground">
				The page you&apos;re looking for doesn&apos;t exist or was moved.
			</p>
			<div className="flex justify-center">
				<Button nativeButton={false} render={<Link href="/" />}>Go home</Button>
			</div>
		</main>
	);
}
