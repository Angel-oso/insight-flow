import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Avatar, HealthChip, PriorityChip, StatusLabel } from "./mock";

const card = "rounded-xl border border-lp-line bg-lp-surface p-6 transition-colors hover:border-lp-line-strong";

function FeatureText({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
	return (
		<>
			<h3 className="font-display text-[17px] font-semibold tracking-[-0.02em]">{title}</h3>
			<p className="mt-2 text-sm leading-6 text-lp-muted">{children}</p>
		</>
	);
}

/** The public form, reduced to its fields. */
function FormArt() {
	return (
		<div aria-hidden="true" className="mx-auto w-full max-w-[250px] rounded-lg border border-lp-line-strong bg-lp-surface p-4 shadow-[0_16px_40px_-24px_rgb(0_0_0/0.4)]">
			<p className="text-xs font-semibold">Share feedback</p>
			<p className="mt-0.5 text-[10px] text-lp-subtle">No account needed</p>
			<div className="mt-3 space-y-2">
				<div className="h-6 rounded border border-lp-line px-2 text-[10px] leading-6 text-lp-muted">Search ignores accents</div>
				<div className="h-10 rounded border border-lp-line" />
				<div className="flex gap-1">
					{["Bug", "Idea", "Question"].map((label, index) => (
						<span key={label} className={cn("rounded border px-1.5 py-0.5 text-[9px]", index === 0 ? "border-lp-accent bg-lp-accent-soft text-lp-accent" : "border-lp-line text-lp-subtle")}>
							{label}
						</span>
					))}
				</div>
				<div className="h-6 rounded bg-lp-accent text-center text-[10px] font-medium leading-6 text-lp-accent-fg">Send feedback</div>
			</div>
		</div>
	);
}

/** Three items stacked like windows, each at a different triage step. */
function TriageArt() {
	const rows = [
		{ title: "Checkout fails", priority: "Critical", status: "New", owner: null },
		{ title: "Export as PDF", priority: "Medium", status: "In review", owner: "Leo Park" },
		{ title: "Shorter onboarding", priority: "Low", status: "Planned", owner: "Maya Ortiz" },
	] as const;
	return (
		<div aria-hidden="true" className="relative mx-auto h-[176px] w-full max-w-[270px]">
			{rows.map((row, index) => (
				<div
					key={row.title}
					className="absolute inset-x-0 flex items-center justify-between gap-2 rounded-lg border border-lp-line-strong bg-lp-surface px-3 py-2.5 shadow-[0_12px_30px_-20px_rgb(0_0_0/0.45)]"
					style={{ top: index * 60, left: index * 12, right: (2 - index) * 12 }}
				>
					<span className="min-w-0">
						<span className="block truncate text-[11px] font-medium">{row.title}</span>
						<span className="mt-1 block">
							<StatusLabel status={row.status} />
						</span>
					</span>
					<span className="flex flex-col items-end gap-1">
						<PriorityChip priority={row.priority} />
						<Avatar name={row.owner} />
					</span>
				</div>
			))}
		</div>
	);
}

/** Received vs. resolved per day: plain geometry, no chart library. */
function DashboardArt() {
	const days = [
		[6, 3], [8, 4], [5, 5], [9, 6], [7, 6], [11, 7], [8, 8], [10, 9], [7, 8], [12, 10],
	] as const;
	return (
		<div aria-hidden="true" className="mx-auto w-full max-w-[270px] rounded-lg border border-lp-line-strong bg-lp-surface p-4 shadow-[0_16px_40px_-24px_rgb(0_0_0/0.4)]">
			<div className="flex items-center justify-between">
				<p className="text-xs font-semibold">Last 30 days</p>
				<HealthChip health="Needs attention" />
			</div>
			<svg viewBox="0 0 200 72" className="mt-4 h-[72px] w-full">
				{days.map(([received, resolved], index) => (
					<g key={index} transform={`translate(${index * 20 + 3} 0)`}>
						<rect y={72 - received * 6} width="6" height={received * 6} rx="1.5" className="fill-lp-accent" />
						<rect x="7" y={72 - resolved * 6} width="6" height={resolved * 6} rx="1.5" className="fill-lp-line-strong" />
					</g>
				))}
			</svg>
			<div className="mt-3 flex gap-4 text-[10px] text-lp-muted">
				<span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-lp-accent" />Received</span>
				<span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-lp-line-strong" />Resolved</span>
			</div>
		</div>
	);
}

const textFeatures = [
	{
		title: "Views shaped by role",
		body: "Members open on their own queue. Coordinators see workload by person. Leaders see every project at once.",
	},
	{
		title: "Organization workspace",
		body: "Administrators get project health, open and critical counts, and recent activity across the organization.",
	},
	{
		title: "Your own vocabulary",
		body: "Rename statuses, categories, and priorities, pick their colors, and decide which statuses close the backlog.",
	},
	{
		title: "Invitations that expire",
		body: "One-time links carry a project role and expire within a day. Nobody can grant more access than they hold.",
	},
	{
		title: "A traceable history",
		body: "Every assignment, status change, and internal note leaves an entry, so decisions can be explained later.",
	},
] as const;

export function LandingFeatures() {
	return (
		<section id="features" aria-labelledby="features-title" className="scroll-mt-20">
			<div className="mx-auto max-w-[1200px] px-4 py-24 sm:px-8 sm:py-32">
				<h2 id="features-title" className="max-w-3xl text-balance font-display text-3xl font-semibold tracking-[-0.035em] sm:text-[2.5rem] sm:leading-[1.1]">
					What&apos;s in InsightFlow?{" "}
					<span className="text-lp-subtle">Everything a team needs to go from a request to a decision.</span>
				</h2>
				<div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{[
						{ art: <FormArt />, title: "A public link per project", body: "Anyone can submit a title, a description, and a category. You decide when the link is open." },
						{ art: <TriageArt />, title: "One inbox for triage", body: "Search and filter, set category and priority, assign an owner, and leave notes only your team sees." },
						{ art: <DashboardArt />, title: "Dashboards for deciding", body: "Received versus resolved, backlog, and project health over 7, 30, 90 days or your own dates." },
					].map((feature) => (
						<article key={feature.title} className={cn(card, "flex flex-col")}>
							<div className="flex min-h-[200px] items-center">{feature.art}</div>
							<div className="mt-6">
								<FeatureText title={feature.title}>{feature.body}</FeatureText>
							</div>
						</article>
					))}
					{textFeatures.map((feature) => (
						<article key={feature.title} className={card}>
							<FeatureText title={feature.title}>{feature.body}</FeatureText>
						</article>
					))}
					<Link
						href="/signup"
						className="group flex flex-col justify-between gap-6 rounded-xl bg-lp-accent p-6 text-lp-accent-fg transition-opacity hover:opacity-90"
					>
						<span>
							<span className="block font-display text-[17px] font-semibold tracking-[-0.02em]">Start with one project</span>
							<span className="mt-2 block text-sm leading-6 opacity-80">
								Name your organization and its first project. Your public link is ready right away.
							</span>
						</span>
						<span className="flex items-center gap-2 text-sm font-medium">
							Create an account
							<ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
						</span>
					</Link>
				</div>
			</div>
		</section>
	);
}
