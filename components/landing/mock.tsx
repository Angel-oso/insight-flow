import { cn } from "@/lib/utils";

/**
 * Product mockups for the landing. All content is illustrative and every
 * window says so; the chips reuse the app's own status colors, the only
 * color on an otherwise monochrome page.
 */

export type Priority = "Critical" | "High" | "Medium" | "Low";
export type Status = "New" | "In review" | "Planned" | "In progress" | "Completed";
export type Health = "At risk" | "Needs attention" | "Healthy";

const priorityTone: Record<Priority, string> = {
	Critical: "bg-dashboard-danger-soft text-dashboard-danger",
	High: "bg-dashboard-warning-soft text-dashboard-warning-foreground",
	Medium: "bg-dashboard-info-soft text-dashboard-info",
	Low: "bg-lp-surface-2 text-lp-muted",
};

const statusTone: Record<Status, string> = {
	New: "text-dashboard-info",
	"In review": "text-dashboard-warning-foreground",
	Planned: "text-dashboard-primary",
	"In progress": "text-dashboard-primary",
	Completed: "text-dashboard-success",
};

const healthTone: Record<Health, string> = {
	"At risk": "bg-dashboard-danger-soft text-dashboard-danger",
	"Needs attention": "bg-dashboard-warning-soft text-dashboard-warning-foreground",
	Healthy: "bg-dashboard-success-soft text-dashboard-success",
};

export function PriorityChip({ priority }: { readonly priority: Priority }) {
	return (
		<span className={cn("inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] font-medium", priorityTone[priority])}>
			{priority}
		</span>
	);
}

export function StatusLabel({ status }: { readonly status: Status }) {
	return (
		<span className={cn("inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium", statusTone[status])}>
			<span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
			{status}
		</span>
	);
}

export function HealthChip({ health }: { readonly health: Health }) {
	return (
		<span className={cn("inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] font-semibold", healthTone[health])}>
			{health}
		</span>
	);
}

export function Avatar({ name }: { readonly name: string | null }) {
	if (!name) {
		return <span className="text-[11px] text-lp-subtle">Unassigned</span>;
	}
	const initials = name
		.split(" ")
		.map((part) => part[0])
		.join("");
	return (
		<span className="inline-flex items-center gap-1.5 text-[11px] text-lp-muted">
			<span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-lp-surface-2 text-[9px] font-semibold text-lp-fg ring-1 ring-lp-line">
				{initials}
			</span>
			<span className="hidden sm:inline">{name}</span>
		</span>
	);
}

/** An application window: title bar, honest "Example data" label, content. */
export function MockWindow({
	title,
	className,
	children,
}: {
	readonly title: string;
	readonly className?: string;
	readonly children: React.ReactNode;
}) {
	return (
		<figure
			className={cn(
				"overflow-hidden rounded-xl border border-lp-line-strong bg-lp-surface text-left shadow-[0_24px_60px_-28px_rgb(0_0_0/0.35)]",
				className,
			)}
		>
			<figcaption className="flex h-10 items-center justify-between gap-3 border-b border-lp-line px-4">
				<span className="truncate text-xs font-medium text-lp-fg">{title}</span>
				<span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-lp-subtle">Example data</span>
			</figcaption>
			{children}
		</figure>
	);
}
