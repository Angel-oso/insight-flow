import type { ReactNode } from "react";

export function SectionHeading({
	title,
	description,
	action,
}: {
	readonly title: string;
	readonly description?: string;
	readonly action?: ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div>
				<h2 className="text-sm font-semibold tracking-tight">{title}</h2>
				{description ? (
					<p className="mt-0.5 text-[10px] text-muted-foreground">
						{description}
					</p>
				) : null}
			</div>
			{action}
		</div>
	);
}
