import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function AuthCard({
	title,
	description,
	children,
	footer,
}: {
	readonly title: string;
	readonly description: string;
	readonly children: ReactNode;
	readonly footer: ReactNode;
}) {
	return (
		<Card className="gap-0 shadow-none">
			<CardHeader className="gap-1 pb-5">
				<h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">
					{title}
				</h2>
				<p className="text-sm leading-6 text-muted-foreground">{description}</p>
			</CardHeader>
			<CardContent className="pb-5">{children}</CardContent>
			<div className="border-t px-5 py-4 text-center text-sm text-muted-foreground">
				{footer}
			</div>
		</Card>
	);
}
