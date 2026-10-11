import { LandingActions } from "./landing-actions";
import { LiveInbox } from "./live-inbox";

/** Hairline frame with corner marks, as on nextjs.org. */
function Frame() {
	const corner = "absolute size-[11px] text-lp-line-strong";
	return (
		<div aria-hidden="true" className="pointer-events-none absolute inset-x-4 top-0 bottom-0 sm:inset-x-8">
			<div className="absolute inset-y-0 left-0 w-px bg-lp-line" />
			<div className="absolute inset-y-0 right-0 w-px bg-lp-line" />
			<div className="absolute inset-x-0 top-[22%] h-px bg-lp-line" />
			<div className="absolute inset-x-0 bottom-[30%] h-px bg-lp-line" />
			{[
				"left-0 top-[22%] -translate-x-1/2 -translate-y-1/2",
				"right-0 top-[22%] translate-x-1/2 -translate-y-1/2",
				"left-0 bottom-[30%] -translate-x-1/2 translate-y-1/2",
				"right-0 bottom-[30%] translate-x-1/2 translate-y-1/2",
			].map((position) => (
				<svg key={position} viewBox="0 0 11 11" className={`${corner} ${position}`}>
					<path d="M5.5 0v11M0 5.5h11" stroke="currentColor" strokeWidth="1" />
				</svg>
			))}
		</div>
	);
}

export function LandingHero() {
	return (
		<section aria-labelledby="landing-title" className="relative">
			<div className="relative mx-auto max-w-[1200px] px-4 sm:px-8">
				<Frame />
				<div className="relative mx-auto max-w-4xl px-2 pt-24 pb-20 text-center sm:pt-32 sm:pb-24">
					<h1
						id="landing-title"
						className="text-balance font-display text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-7xl lg:text-[5.25rem]"
					>
						Turn feedback into better product decisions
					</h1>
					<p className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-7 text-lp-muted sm:text-xl sm:leading-8">
						InsightFlow collects feedback through a public link, gives every item an owner and a status, and shows{" "}
						<span className="font-medium text-lp-fg">which projects need your attention</span>.
					</p>
					<div className="mt-10 flex justify-center">
						<LandingActions />
					</div>
					<p className="mt-6 font-mono text-[13px] text-lp-subtle">
						<span className="text-lp-muted">Your public link</span> · /f/
						<span className="text-lp-fg">your-project</span>
					</p>
				</div>
			</div>
			<div className="relative mx-auto max-w-[1100px] px-4 pb-24 sm:px-8 sm:pb-32">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-x-[12%] -top-10 h-48 rounded-full bg-[var(--lp-glow)] blur-[80px]"
				/>
				<div className="relative">
					<LiveInbox />
				</div>
			</div>
		</section>
	);
}
