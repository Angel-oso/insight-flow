import Link from "next/link";
import { LandingActions } from "./landing-actions";
import { LandingHero } from "./landing-hero";
import { LandingRoles } from "./landing-roles";
import { LandingWorkflow } from "./landing-workflow";

const linkStyle = "rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

export function LandingPage() {
	return (
		<div className="min-h-dvh bg-dashboard-canvas text-foreground">
			<a href="#main-content" className="sr-only z-50 rounded-lg bg-background p-3 text-sm font-medium focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:outline-2 focus:outline-ring">Skip to content</a>
			<div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
				<header className="flex flex-wrap items-center justify-between gap-4 border-b py-5">
					<Link href="/" className={`font-heading text-lg font-semibold tracking-tight ${linkStyle}`}>InsightFlow</Link>
					<nav aria-label="Main navigation" className="flex items-center gap-5 text-sm text-muted-foreground">
						<a href="#workflow" className={`hidden sm:inline ${linkStyle}`}>Workflow</a>
						<a href="#roles" className={`hidden sm:inline ${linkStyle}`}>Roles</a>
						<LandingActions compact />
					</nav>
				</header>
				<main id="main-content" tabIndex={-1} className="outline-none">
					<LandingHero />
					<LandingWorkflow />
					<LandingRoles />
					<section aria-labelledby="get-started-title" className="mb-12 flex flex-col gap-6 rounded-xl bg-muted px-6 py-8 sm:mb-16 sm:flex-row sm:items-center sm:justify-between sm:px-8">
						<div>
							<h2 id="get-started-title" className="font-heading text-2xl font-semibold tracking-tight">Listen clearly. Decide confidently.</h2>
							<p className="mt-2 text-sm leading-6 text-muted-foreground">Start with a workspace, a project, and a public feedback link.</p>
						</div>
						<LandingActions />
					</section>
				</main>
				<footer className="flex flex-col gap-2 border-t py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
					<p className="font-heading font-semibold text-foreground">InsightFlow</p>
					<p>Turn feedback into clear, traceable product decisions.</p>
				</footer>
			</div>
		</div>
	);
}
