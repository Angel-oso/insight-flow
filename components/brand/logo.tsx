import { cn } from "@/lib/utils";

/**
 * InsightFlow logo: an indigo tile (the app's primary color) holding three
 * bars that narrow into one, scattered feedback funnelled into a decision.
 * The same geometry ships as the favicon in app/icon.svg.
 */
export function LogoMark({
	className,
	title,
}: {
	readonly className?: string;
	/** Accessible name when the mark stands alone; omit when text follows. */
	readonly title?: string;
}) {
	return (
		<svg
			viewBox="0 0 32 32"
			role={title ? "img" : undefined}
			aria-hidden={title ? undefined : true}
			aria-label={title}
			className={cn("size-8 shrink-0", className)}
		>
			<rect width="32" height="32" rx="8" fill="oklch(0.49 0.2 276)" />
			<rect x="6" y="8.5" width="20" height="4.5" rx="2.25" fill="#fff" />
			<rect x="9.5" y="14" width="13" height="4.5" rx="2.25" fill="#fff" fillOpacity="0.88" />
			<rect x="13" y="19.5" width="6" height="4.5" rx="2.25" fill="#fff" fillOpacity="0.76" />
		</svg>
	);
}

/** Mark plus wordmark. The wordmark inherits the surrounding font and color. */
export function Logo({
	className,
	markClassName,
	wordmarkClassName,
}: {
	readonly className?: string;
	readonly markClassName?: string;
	readonly wordmarkClassName?: string;
}) {
	return (
		<span className={cn("inline-flex items-center gap-2", className)}>
			<LogoMark className={cn("size-7", markClassName)} />
			<span className={cn("font-semibold tracking-[-0.02em]", wordmarkClassName)}>InsightFlow</span>
		</span>
	);
}
