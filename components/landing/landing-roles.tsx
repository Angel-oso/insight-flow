import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, HealthChip, MockWindow, PriorityChip, StatusLabel, type Health } from "./mock";

function OrganizationMock() {
	const projects: readonly { name: string; open: number; critical: number; resolution: string; health: Health }[] = [
		{ name: "Mobile App", open: 24, critical: 2, resolution: "61%", health: "At risk" },
		{ name: "Client Portal", open: 9, critical: 0, resolution: "74%", health: "Needs attention" },
		{ name: "Academy", open: 4, critical: 0, resolution: "82%", health: "Needs attention" },
		{ name: "Help Center", open: 0, critical: 0, resolution: "100%", health: "Healthy" },
	];
	return (
		<MockWindow title="Northwind · Workspace overview">
			<div className="grid grid-cols-3 divide-x divide-lp-line border-b border-lp-line">
				{[
					["Received", "128"],
					["Open", "37"],
					["Resolution", "72%"],
				].map(([label, value]) => (
					<div key={label} className="px-4 py-4">
						<p className="text-[10px] font-medium uppercase tracking-[0.08em] text-lp-subtle">{label}</p>
						<p className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.03em]">{value}</p>
					</div>
				))}
			</div>
			<table className="w-full text-left text-[12px]">
				<thead className="text-[10px] uppercase tracking-[0.08em] text-lp-subtle">
					<tr className="border-b border-lp-line">
						<th className="px-4 py-2.5 font-medium">Project</th>
						<th className="px-2 py-2.5 text-right font-medium">Open</th>
						<th className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">Critical</th>
						<th className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">Resolution</th>
						<th className="px-4 py-2.5 text-right font-medium">Health</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-lp-line">
					{projects.map((project) => (
						<tr key={project.name}>
							<td className="px-4 py-3 font-medium">{project.name}</td>
							<td className="px-2 py-3 text-right tabular-nums">{project.open}</td>
							<td className="hidden px-2 py-3 text-right tabular-nums text-lp-muted sm:table-cell">{project.critical}</td>
							<td className="hidden px-2 py-3 text-right tabular-nums text-lp-muted sm:table-cell">{project.resolution}</td>
							<td className="px-4 py-3 text-right"><HealthChip health={project.health} /></td>
						</tr>
					))}
				</tbody>
			</table>
		</MockWindow>
	);
}

function TriageMock() {
	const fields = [
		["Category", <span key="c" className="text-[12px]">Bug</span>],
		["Priority", <PriorityChip key="p" priority="High" />],
		["Status", <StatusLabel key="s" status="In review" />],
		["Owner", <Avatar key="o" name="Leo Park" />],
	] as const;
	return (
		<MockWindow title="Client Portal · Feedback">
			<div className="p-5">
				<p className="text-[11px] text-lp-subtle">Received through the public link · 2 days ago</p>
				<h4 className="mt-1 font-display text-lg font-semibold tracking-[-0.02em]">Search ignores accented names</h4>
				<p className="mt-2 text-[13px] leading-6 text-lp-muted">
					Looking for &ldquo;José&rdquo; returns nothing unless I type &ldquo;Jose&rdquo;. Happens on the members page.
				</p>
				<dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-lp-line py-4 sm:grid-cols-4">
					{fields.map(([label, value]) => (
						<div key={label}>
							<dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-lp-subtle">{label}</dt>
							<dd className="mt-1.5">{value}</dd>
						</div>
					))}
				</dl>
				<div className="mt-4 flex gap-3">
					<span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-lp-surface-2 text-[9px] font-semibold ring-1 ring-lp-line">MO</span>
					<div className="min-w-0 rounded-lg bg-lp-surface-2 px-3 py-2">
						<p className="text-[11px] font-medium">Maya Ortiz <span className="font-normal text-lp-subtle">· internal note</span></p>
						<p className="mt-0.5 text-[12px] leading-5 text-lp-muted">Same root cause as the export bug. Leo, can you take both?</p>
					</div>
				</div>
			</div>
		</MockWindow>
	);
}

function MyWorkMock() {
	const items = [
		{ title: "Invoices show last year's tax rate", priority: "Critical", status: "In progress", comment: true },
		{ title: "Search ignores accented names", priority: "High", status: "In review", comment: true },
		{ title: "Export the monthly report as PDF", priority: "Medium", status: "Planned", comment: false },
		{ title: "Reading view needs a dark mode", priority: "Low", status: "New", comment: false },
	] as const;
	return (
		<MockWindow title="My work">
			<div className="flex items-center justify-between border-b border-lp-line px-4 py-3 text-[12px]">
				<span className="font-medium">4 open · 1 urgent</span>
				<span className="text-lp-muted">6 resolved this period</span>
			</div>
			<ul className="divide-y divide-lp-line">
				{items.map((item) => (
					<li key={item.title} className="flex items-center justify-between gap-3 px-4 py-3">
						<span className="min-w-0">
							<span className="block truncate text-[13px] font-medium">{item.title}</span>
							<span className="mt-1 flex items-center gap-3">
								<StatusLabel status={item.status} />
								{item.comment ? (
									<span className="inline-flex items-center gap-1 text-[11px] font-medium text-lp-accent">
										<MessageSquare aria-hidden="true" className="size-3" /> New comment
									</span>
								) : null}
							</span>
						</span>
						<PriorityChip priority={item.priority} />
					</li>
				))}
			</ul>
		</MockWindow>
	);
}

const roles = [
	{
		id: "leaders",
		title: "See every project's health at a glance",
		lead: "Administrators see the whole organization",
		rest: "which projects are building backlog, and which need intervention now.",
		features: ["Organization metrics", "Project health table", "Activity across projects", "7, 30, 90 days or custom dates"],
		mock: <OrganizationMock />,
	},
	{
		id: "coordinators",
		title: "Keep the queue moving",
		lead: "Coordinators triage what arrives",
		rest: "set priority, assign an owner, and see how the work is spread across the team.",
		features: ["Category and priority", "Owner assignment", "Workload by person", "Log feedback from calls and email"],
		mock: <TriageMock />,
	},
	{
		id: "members",
		title: "Know exactly what is yours",
		lead: "Members open on their own queue",
		rest: "ordered by priority and age, with the items that got a new comment from someone else.",
		features: ["Assigned to me", "New comments", "Resolved work this period", "Built for mobile too"],
		mock: <MyWorkMock />,
	},
] as const;

export function LandingRoles() {
	return (
		<section id="roles" aria-label="Built for every role" className="scroll-mt-20 border-t border-lp-line">
			{roles.map((role, index) => (
				<div key={role.id} className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8 sm:py-28">
					<h2 className={cn("max-w-xl text-balance font-display text-3xl font-semibold tracking-[-0.035em] sm:text-[2.75rem] sm:leading-[1.08]", index % 2 === 1 && "lg:ml-auto lg:text-right")}>
						{role.title}
					</h2>
					<div className="mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-16">
						<div className={cn(index % 2 === 1 && "lg:order-last")}>{role.mock}</div>
						<div>
							<p className="max-w-sm text-xl leading-8 tracking-[-0.015em]">
								{role.lead} <span className="text-lp-subtle">— {role.rest}</span>
							</p>
							<p className="mt-8 text-xs font-medium text-lp-subtle">Features</p>
							<ul className="mt-3 space-y-2 text-sm font-medium">
								{role.features.map((feature) => (
									<li key={feature}>{feature}</li>
								))}
							</ul>
						</div>
					</div>
				</div>
			))}
		</section>
	);
}
