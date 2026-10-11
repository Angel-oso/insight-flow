const roles = [
	{ name: "Administrators and product leads", description: "Review project health and feedback trends, manage the workspace, and decide where to intervene." },
	{ name: "Managers and coordinators", description: "Triage incoming feedback, assign owners, and keep the team's backlog moving." },
	{ name: "Team members", description: "Review assigned feedback, add context, and update progress within their permissions." },
	{ name: "Feedback senders", description: "Share a request or issue through an active public form. No InsightFlow account needed." },
] as const;

export function LandingRoles() {
	return (
		<section id="roles" aria-labelledby="roles-title" className="grid scroll-mt-8 gap-8 border-t py-12 sm:py-16 lg:grid-cols-2 lg:gap-16">
			<div>
				<h2 id="roles-title" className="max-w-md text-balance font-heading text-2xl font-semibold tracking-tight sm:text-3xl">A shared workflow. A clear role for everyone.</h2>
				<p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">Leaders see the bigger picture. Coordinators organize the work. Members know what needs their attention.</p>
			</div>
			<dl className="divide-y">
				{roles.map((role) => (
					<div key={role.name} className="py-5 first:pt-0 last:pb-0">
						<dt className="font-heading text-base font-semibold tracking-tight">{role.name}</dt>
						<dd className="mt-2 text-sm leading-6 text-muted-foreground">{role.description}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
