"use client";

import Link from "next/link";
import { withNext } from "@/lib/safe-next";
import { useSafeNext } from "./use-safe-next";

/** Link between /login and /signup that keeps the `?next=` redirect target. */
export function AuthSwitchLink({
	href,
	action,
	label,
}: {
	readonly href: string;
	readonly action: string;
	readonly label: string;
}) {
	const next = useSafeNext();
	return (
		<p>
			{action}{" "}
			<Link
				href={withNext(href, next)}
				className="font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
			>
				{label}
			</Link>
		</p>
	);
}
