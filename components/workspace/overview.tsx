"use client";

import Link from "next/link";
import { Building2, Inbox, Settings } from "lucide-react";
import { useQuery } from "convex/react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { api } from "@/convex/_generated/api";
import { DateRangeControl } from "@/components/home/dashboard/dashboard-header";
import { overviewWindow, OVERVIEW_RANGES, utcDate } from "@/components/home/dashboard/date-window";
import { useOverviewClock } from "@/components/home/dashboard/use-overview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { projectPath } from "@/lib/projects";
import { useOrganization } from "./use-organization";
import { OrganizationSwitcher } from "./organization-switcher";
import { CreateProject } from "./create-project";
import { AdminOverview } from "./admin-overview";

export function WorkspaceOverview() {
	const { organization, organizations, loading, setOrganization } = useOrganization();
	const [dates, setDates] = useQueryStates({ range: parseAsStringLiteral(OVERVIEW_RANGES).withDefault("30"), from: parseAsString.withDefault(""), to: parseAsString.withDefault("") }, { clearOnDefault: false });
	const now = useOverviewClock();
	const window = overviewWindow(dates.range, dates.from, dates.to, now);
	const overview = useQuery(api.organizations.queries.overview, organization && window ? { organizationId: organization.id, from: window.from, to: window.to } : "skip");
	if (!organization) return <p role="status" className="p-8 text-sm text-muted-foreground">{loading ? "Loading your organizations…" : "This organization is not available to your account. Choose Workspace in the sidebar to return to your organization."}</p>;
	const firstProject = overview?.projects[0];
	return <main className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
		<header className="flex flex-col gap-6 border-b pb-7">
			<div className="flex max-w-2xl items-start gap-3">
				<span className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-dashboard-primary-soft text-dashboard-primary"><Building2 className="size-4" /></span>
				<div><h1 className="break-words font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{organization.name} overview</h1><p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground">{organization.isAdmin ? "Organization-wide feedback health, project risk, and the evidence that needs your attention." : "Your projects and the feedback queues you can work on."}</p></div>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<OrganizationSwitcher organization={organization} organizations={organizations ?? []} onChange={setOrganization} />
				<DateRangeControl range={dates.range} rangeLabel={window?.label ?? "Custom dates"} fromDate={dates.from || utcDate(now - 29 * 86_400_000)} toDate={dates.to || utcDate(now)} today={utcDate(now)} onRangeChange={(range) => void setDates({ range, from: null, to: null })} onCustomChange={(from, to) => void setDates({ range: "custom", from, to })} />
				{firstProject && <Button variant="outline" size="lg" nativeButton={false} render={<Link href={projectPath(firstProject.slug, "feedback")} />}><Inbox />View feedback</Button>}
				{organization.isAdmin && <CreateProject key={organization.id} organizationId={organization.id} organizationName={organization.name} />}
				{organization.isAdmin && <Button variant="ghost" nativeButton={false} render={<Link href={`/workspace/settings?organization=${organization.id}`} />}><Settings />Organization settings</Button>}
			</div>
		</header>
		{!window ? <p role="alert" className="mt-7 text-muted-foreground">Choose valid dates through today, covering no more than 365 days.</p> : !overview ? <p role="status" className="mt-7 text-muted-foreground">Loading workspace overview…</p> : <div className="mt-7 space-y-6">
			{overview.admin && <AdminOverview admin={overview.admin} projects={overview.projects} now={now} />}
			<section aria-labelledby="workspace-projects-heading">
				<h2 id="workspace-projects-heading" className="font-heading text-xl font-semibold tracking-[-0.025em]">Your projects</h2>
				<p className="mt-1 text-sm text-muted-foreground">Open an overview or go straight to its feedback inbox.</p>
				<div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{overview.projects.map((project) => <Card key={project.slug} className="gap-4 rounded-xl py-5 shadow-none ring-foreground/8">
					<CardHeader className="px-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-words font-heading text-lg font-semibold"><Link href={projectPath(project.slug, "home")} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary">{project.name}</Link></h3><span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{project.status}</span></div><p className="break-words text-sm leading-6 text-muted-foreground">{project.description}</p></CardHeader>
					<CardContent className="space-y-4 px-5"><dl className="flex gap-6 tabular-nums"><div><dt className="text-xs text-muted-foreground">Open feedback</dt><dd className="mt-1 text-xl font-semibold">{project.open}</dd></div><div><dt className="text-xs text-muted-foreground">Critical items</dt><dd className={`mt-1 text-xl font-semibold ${project.critical ? "text-dashboard-danger" : ""}`}>{project.critical}</dd></div></dl><div className="flex flex-wrap gap-2"><Button variant="outline" nativeButton={false} render={<Link href={projectPath(project.slug, "home")} />}>Overview</Button><Button variant="ghost" nativeButton={false} render={<Link href={projectPath(project.slug, "feedback")} />}>Feedback inbox</Button></div></CardContent>
				</Card>)}</div>
				{overview.projects.length === 0 && <p className="mt-4 rounded-xl border bg-background p-5 text-sm text-muted-foreground">No projects are linked to your account in this organization. {organization.isAdmin ? "Create a project to get started." : "Ask an administrator for project access."}</p>}
			</section>
		</div>}
		<footer className="mt-8 border-t pt-5 text-xs text-muted-foreground">Live organization data · Up to 50 projects and 200 feedback items per project.</footer>
	</main>;
}
