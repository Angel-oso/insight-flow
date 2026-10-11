import { LandingActions } from "./landing-actions";

export function LandingHero() {
	return (
		<section aria-labelledby="landing-title" className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-end lg:gap-16 lg:py-24">
			<div>
				<h1 id="landing-title" className="max-w-3xl text-balance font-heading text-4xl font-semibold leading-[1.15] tracking-[-0.035em] sm:text-5xl lg:text-6xl">
					InsightFlow turns feedback into better product decisions.
				</h1>
				<p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
					Collect, organize, and prioritize feedback in one shared place. Give your team a clear path from an incoming request to a traceable decision.
				</p>
				<div className="mt-8"><LandingActions /></div>
			</div>
			<div className="border-t pt-6 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
				<h2 className="font-heading text-xl font-semibold tracking-tight">Good feedback gets lost between conversations.</h2>
				<p className="mt-3 text-sm leading-6 text-muted-foreground">
					Support threads, calls, forms, and spreadsheets all hold useful context. When it stays scattered, requests get lost, patterns surface late, and priorities become hard to explain.
				</p>
				<p className="mt-4 text-sm font-medium leading-6">Bring the context together before deciding what comes next.</p>
			</div>
		</section>
	);
}
