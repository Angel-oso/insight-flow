const steps = [
	{
		title: "Collect through a public link",
		description: "Share a project's feedback form with customers, colleagues, or clients. They can submit without an account.",
	},
	{
		title: "Organize the incoming feedback",
		description: "Keep requests in a project inbox, with categories, statuses, and priorities that make the queue easier to review.",
	},
	{
		title: "Assign ownership and move it forward",
		description: "Give feedback an owner, add internal context, and move it through a clear lifecycle from new to completed or discarded.",
	},
	{
		title: "Decide with the dashboard",
		description: "Review feedback volume, urgency, patterns, and project health to see where your team needs to focus next.",
	},
] as const;

export function LandingWorkflow() {
	return (
		<section id="workflow" aria-labelledby="workflow-title" className="scroll-mt-8 border-t py-12 sm:py-16">
			<h2 id="workflow-title" className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">One workflow, from listening to action.</h2>
			<p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Structured intake, team triage, and a clearer view of what deserves attention.</p>
			<ol className="mt-8 grid divide-y rounded-xl border bg-card px-6 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
				{steps.map((step, index) => (
					<li key={step.title} className="py-6 sm:px-4">
						<span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-dashboard-primary-soft text-sm font-semibold tabular-nums text-dashboard-primary">{index + 1}</span>
						<h3 className="mt-4 font-heading text-base font-semibold leading-6 tracking-tight">{step.title}</h3>
						<p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
					</li>
				))}
			</ol>
		</section>
	);
}
