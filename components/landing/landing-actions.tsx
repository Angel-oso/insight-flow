"use client";

import { useConvexAuth } from "convex/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const base =
	"inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,opacity] duration-150";

const sizes = {
	sm: "h-8 rounded-md px-3 text-[13px]",
	lg: "h-11 rounded-full px-5 text-sm sm:h-12 sm:px-6 sm:text-[15px]",
} as const;

const tones = {
	solid: "bg-lp-accent text-lp-accent-fg shadow-[0_8px_24px_-12px_var(--lp-accent)] hover:opacity-90",
	outline: "border border-lp-line-strong bg-lp-surface text-lp-fg hover:bg-lp-surface-2",
	ghost: "text-lp-muted hover:text-lp-fg",
} as const;

export function LandingButton({
	href,
	size = "lg",
	tone = "solid",
	className,
	children,
}: {
	readonly href: string;
	readonly size?: keyof typeof sizes;
	readonly tone?: keyof typeof tones;
	readonly className?: string;
	readonly children: React.ReactNode;
}) {
	return (
		<Link href={href} className={cn(base, sizes[size], tones[tone], className)}>
			{children}
		</Link>
	);
}

/**
 * Session-aware calls to action. While the session resolves, the slot
 * keeps its size so the layout does not jump.
 */
export function LandingActions({ size = "lg" }: { readonly size?: keyof typeof sizes }) {
	const { isLoading, isAuthenticated } = useConvexAuth();

	if (isLoading) {
		return (
			<span role="status" className={cn(base, sizes[size], "text-lp-subtle")}>
				<span className="sr-only">Checking your session</span>
			</span>
		);
	}

	if (isAuthenticated) {
		return (
			<LandingButton href="/home" size={size}>
				Open workspace
				<ArrowRight aria-hidden="true" className="size-4" />
			</LandingButton>
		);
	}

	return (
		<div className={cn("flex items-center", size === "sm" ? "gap-2" : "flex-wrap justify-center gap-3")}>
			<LandingButton href="/login" size={size} tone="outline">
				Sign in
			</LandingButton>
			<LandingButton href="/signup" size={size} className={size === "lg" ? "order-first" : undefined}>
				{size === "sm" ? "Sign up" : "Create an account"}
				{size === "lg" ? <ArrowRight aria-hidden="true" className="size-4" /> : null}
			</LandingButton>
		</div>
	);
}
