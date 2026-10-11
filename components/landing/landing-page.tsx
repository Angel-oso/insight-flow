/*
 * THESIS: the page shows the feedback loop running (a submission arriving,
 * an owner taking it, a project's health changing) instead of describing it.
 * OWN-WORLD: nextjs.org / vercel.com layout in the app's palette: warm canvas
 * or deep blue-gray ground, hairlines, Geist at tight tracking, indigo pill
 * actions, product windows as the only imagery.
 * STORY: a product lead understands the loop, sees what each role gets, and
 * creates an account. FIRST VIEWPORT: centered display title in a hairline
 * frame, primary action first, the public link format below, the live inbox
 * rising under a glow.
 */
import Link from "next/link";
import { Logo, LogoMark } from "@/components/brand/logo";
import { LandingActions } from "./landing-actions";
import { LandingFeatures } from "./landing-features";
import { LandingHero } from "./landing-hero";
import { LandingRoles } from "./landing-roles";
import { LandingStatement } from "./landing-statement";
import { LandingThemeSwitch } from "./landing-theme-switch";
import { LandingWorkflow } from "./landing-workflow";

const navLinks = [
	{ href: "#workflow", label: "Workflow" },
	{ href: "#features", label: "Features" },
	{ href: "#roles", label: "Roles" },
] as const;

function Wordmark() {
	return (
		<Link href="/" aria-label="InsightFlow home" className="rounded-md">
			<Logo wordmarkClassName="font-display text-[15px]" />
		</Link>
	);
}

function Closing() {
	return (
		<section aria-labelledby="closing-title" className="border-t border-lp-line">
			<div className="relative mx-auto max-w-[1200px] px-4 py-28 text-center sm:px-8 sm:py-36">
				<div aria-hidden="true" className="pointer-events-none absolute inset-x-[25%] top-1/2 h-40 -translate-y-1/2 rounded-full bg-[var(--lp-glow)] blur-[90px]" />
				<LogoMark className="relative mx-auto size-12" />
				<h2 id="closing-title" className="relative mx-auto mt-8 max-w-3xl text-balance font-display text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
					Listen clearly. Decide confidently.
				</h2>
				<p className="relative mx-auto mt-5 max-w-xl text-base leading-7 text-lp-muted sm:text-lg">
					Create an organization, name your first project, and share its feedback link today.
				</p>
				<div className="relative mt-10 flex justify-center">
					<LandingActions />
				</div>
			</div>
		</section>
	);
}

function Footer() {
	return (
		<footer className="border-t border-lp-line">
			<div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-8 md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-20">
				<div>
					<Wordmark />
					<p className="mt-3 max-w-xs text-sm leading-6 text-lp-muted">Turn feedback into clear, traceable product decisions.</p>
				</div>
				<nav aria-label="Product">
					<h2 className="text-sm font-medium">Product</h2>
					<ul className="mt-3 space-y-2 text-sm text-lp-muted">
						{navLinks.map((link) => (
							<li key={link.href}><a href={link.href} className="hover:text-lp-fg">{link.label}</a></li>
						))}
					</ul>
				</nav>
				<nav aria-label="Account">
					<h2 className="text-sm font-medium">Account</h2>
					<ul className="mt-3 space-y-2 text-sm text-lp-muted">
						<li><Link href="/login" className="hover:text-lp-fg">Sign in</Link></li>
						<li><Link href="/signup" className="hover:text-lp-fg">Create an account</Link></li>
					</ul>
				</nav>
			</div>
			<div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 border-t border-lp-line px-4 py-6 sm:px-8">
				<p className="text-xs text-lp-subtle">InsightFlow</p>
				<LandingThemeSwitch />
			</div>
		</footer>
	);
}

export function LandingPage() {
	return (
		<div className="landing min-h-dvh">
			<a href="#main-content" className="sr-only z-50 rounded-md bg-lp-fg px-3 py-2 text-sm font-medium text-lp-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
				Skip to content
			</a>
			<header className="sticky top-0 z-40 border-b border-lp-line bg-lp-bg/80 backdrop-blur-md supports-[backdrop-filter]:bg-lp-bg/70">
				<div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-6 px-4 sm:px-8">
					<div className="flex items-center gap-8">
						<Wordmark />
						<nav aria-label="Main navigation" className="hidden items-center gap-6 text-[13px] text-lp-muted md:flex">
							{navLinks.map((link) => (
								<a key={link.href} href={link.href} className="rounded-sm transition-colors hover:text-lp-fg">{link.label}</a>
							))}
						</nav>
					</div>
					<LandingActions size="sm" />
				</div>
			</header>
			<main id="main-content" tabIndex={-1} className="outline-none">
				<LandingHero />
				<LandingStatement />
				<LandingFeatures />
				<LandingWorkflow />
				<LandingRoles />
				<Closing />
			</main>
			<Footer />
		</div>
	);
}
