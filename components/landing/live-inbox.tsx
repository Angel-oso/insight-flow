"use client";

import { Globe, Inbox, LayoutDashboard, Mail, Phone, Settings, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Avatar, HealthChip, MockWindow, PriorityChip, StatusLabel, type Health, type Priority, type Status } from "./mock";

type Source = "Public link" | "Logged from a call" | "Email";

type Item = {
	readonly id: number;
	readonly title: string;
	readonly source: Source;
	readonly category: string;
	readonly priority: Priority;
	readonly status: Status;
	readonly owner: string | null;
};

type Seed = Omit<Item, "id" | "status" | "owner">;

/** Illustrative submissions; nothing here is a real customer. */
const incoming: readonly Seed[] = [
	{ title: "Checkout fails with a saved card", source: "Public link", category: "Bug", priority: "Critical" },
	{ title: "Export the monthly report as PDF", source: "Logged from a call", category: "Feature request", priority: "Medium" },
	{ title: "Search ignores accented names", source: "Public link", category: "Bug", priority: "High" },
	{ title: "Onboarding checklist feels too long", source: "Public link", category: "Improvement", priority: "Low" },
	{ title: "Can students reset their own password?", source: "Email", category: "Question", priority: "Medium" },
	{ title: "Invoices show last year's tax rate", source: "Logged from a call", category: "Bug", priority: "Critical" },
	{ title: "Reading view needs a dark mode", source: "Public link", category: "Feature request", priority: "Low" },
	{ title: "Delivery dates change after payment", source: "Public link", category: "Bug", priority: "High" },
];

const owners = ["Maya Ortiz", "Leo Park", "Sam Rivera"] as const;
const lifecycle: readonly Status[] = ["New", "In review", "Planned", "In progress", "Completed"];
const VISIBLE = 5;

/** Older items move through the lifecycle as new ones arrive. */
function age(item: Item, steps: number): Item {
	const index = Math.min(lifecycle.indexOf(item.status) + steps, lifecycle.length - 1);
	return {
		...item,
		status: lifecycle[index],
		owner: item.owner ?? (index >= 1 ? owners[item.id % owners.length] : null),
	};
}

function initialItems(): Item[] {
	return incoming.slice(0, VISIBLE).map((seed, index) =>
		age({ ...seed, id: index, status: "New", owner: null }, VISIBLE - 1 - index),
	);
}

const sourceIcon: Record<Source, typeof Globe> = {
	"Public link": Globe,
	"Logged from a call": Phone,
	Email: Mail,
};

function healthOf(items: readonly Item[]): Health {
	const open = items.filter((item) => item.status !== "Completed");
	if (open.some((item) => item.priority === "Critical")) return "At risk";
	return open.length > 0 ? "Needs attention" : "Healthy";
}

export function LiveInbox() {
	const [items, setItems] = useState<Item[]>(initialItems);
	const [arrivedId, setArrivedId] = useState<number | null>(null);
	const next = useRef(VISIBLE);
	const frame = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		let visible = false;
		const observer = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
		});
		if (frame.current) observer.observe(frame.current);
		const timer = window.setInterval(() => {
			if (!visible || document.hidden) return;
			const id = next.current;
			next.current += 1;
			const seed = incoming[id % incoming.length];
			setItems((current) => [
				{ ...seed, id, status: "New", owner: null },
				...current.slice(0, VISIBLE - 1).map((item) => age(item, 1)),
			]);
			setArrivedId(id);
		}, 3400);
		return () => {
			window.clearInterval(timer);
			observer.disconnect();
		};
	}, []);

	const open = items.filter((item) => item.status !== "Completed");
	const counters = [
		{ label: "Open", value: open.length },
		{ label: "Critical", value: open.filter((item) => item.priority === "Critical").length },
		{ label: "Unassigned", value: open.filter((item) => item.owner === null).length },
	];

	return (
		<div ref={frame}>
			<MockWindow title="Client Portal · Feedback inbox">
				<div className="grid md:grid-cols-[180px_minmax(0,1fr)]">
					<nav aria-hidden="true" className="hidden border-r border-lp-line p-3 md:block">
						{[
							{ label: "Overview", icon: LayoutDashboard },
							{ label: "Feedback", icon: Inbox, active: true },
							{ label: "Team", icon: Users },
							{ label: "Settings", icon: Settings },
						].map((link) => (
							<span
								key={link.label}
								className={cn(
									"flex h-8 items-center gap-2 rounded-md px-2 text-xs",
									link.active ? "bg-lp-accent-soft font-medium text-lp-accent" : "text-lp-muted",
								)}
							>
								<link.icon className="size-3.5" />
								{link.label}
							</span>
						))}
					</nav>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-lp-line px-4 py-3">
							<dl className="flex gap-5">
								{counters.map((counter) => (
									<div key={counter.label}>
										<dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-lp-subtle">{counter.label}</dt>
										<dd className="mt-0.5 text-lg font-semibold tabular-nums tracking-[-0.02em]">{counter.value}</dd>
									</div>
								))}
							</dl>
							<div className="flex items-center gap-2 text-[11px] text-lp-muted">
								Project health
								<HealthChip health={healthOf(items)} />
							</div>
						</div>
						<ul aria-label="Example feedback queue" aria-live="off" className="divide-y divide-lp-line">
							{items.map((item) => {
								const SourceIcon = sourceIcon[item.source];
								return (
									<li
										key={item.id}
										className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_76px_92px_auto]", item.id === arrivedId && "lp-arrive")}
									>
										<div className="min-w-0">
											<p className="truncate text-[13px] font-medium">{item.title}</p>
											<p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-lp-subtle">
												<SourceIcon aria-hidden="true" className="size-3" />
												{item.source} · {item.category}
											</p>
										</div>
										<PriorityChip priority={item.priority} />
										<span className="col-span-2 flex items-center gap-3 sm:contents">
											<span className="sm:block">
												<StatusLabel status={item.status} />
											</span>
											<Avatar name={item.owner} />
										</span>
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			</MockWindow>
		</div>
	);
}
