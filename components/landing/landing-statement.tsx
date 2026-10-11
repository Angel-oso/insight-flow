/** The problem, in vercel.com's two-tone sentence. */
export function LandingStatement() {
	return (
		<section aria-label="Why InsightFlow" className="border-y border-lp-line">
			<div className="mx-auto max-w-[1200px] px-4 py-24 sm:px-8 sm:py-32">
				<p className="max-w-5xl text-balance font-display text-3xl font-semibold leading-[1.15] tracking-[-0.035em] sm:text-5xl sm:leading-[1.1]">
					Feedback lives in support threads, calls, forms, and spreadsheets.{" "}
					<span className="text-lp-subtle">
						Requests get lost, patterns surface late, and nobody can explain why something was prioritized.
					</span>{" "}
					InsightFlow gives it one home, an owner, and a decision.
				</p>
			</div>
		</section>
	);
}
