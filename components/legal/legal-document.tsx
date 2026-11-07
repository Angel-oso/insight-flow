import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { DEMO_NOTICE, LEGAL } from "@/lib/legal";

/**
 * Shared shell for the public legal pages (/privacy, /terms). Server
 * component, no auth: it must stay reachable for anonymous visitors and for
 * people submitting feedback through a public link.
 */
export function LegalDocument({
	title,
	updated,
	children,
}: {
	readonly title: string;
	readonly updated: string;
	readonly children: ReactNode;
}) {
	return (
		<div className="landing min-h-dvh bg-lp-bg text-lp-fg">
			<header className="border-b border-lp-line">
				<div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-6 px-4 sm:px-8">
					<Link href="/" aria-label="InsightFlow home" className="rounded-md">
						<Logo wordmarkClassName="font-display text-[15px]" />
					</Link>
					<nav aria-label="Legal" className="flex items-center gap-5 text-[13px] text-lp-muted">
						<Link href="/privacy" className="hover:text-lp-fg">Privacy</Link>
						<Link href="/terms" className="hover:text-lp-fg">Terms</Link>
					</nav>
				</div>
			</header>
			<main className="mx-auto max-w-3xl px-4 py-14 sm:px-8 sm:py-20">
				<h1 className="font-display text-4xl font-semibold tracking-[-0.04em] text-balance">{title}</h1>
				<p className="mt-3 text-sm text-lp-muted">Last updated: {updated}</p>
				{DEMO_NOTICE ? (
					<p role="note" className="mt-6 rounded-lg border border-lp-line px-4 py-3 text-sm text-lp-muted">
						InsightFlow is a demo project, not a commercial service. This page is a
						sample policy that describes how the app handles data; don&apos;t submit
						sensitive personal information.
					</p>
				) : null}
				<div className="mt-10 space-y-10 text-[15px] leading-7 text-lp-muted [&_a]:text-lp-fg [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-lp-fg [&_li]:mt-1.5 [&_p+p]:mt-3 [&_strong]:font-medium [&_strong]:text-lp-fg [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
					{children}
				</div>
			</main>
			<footer className="border-t border-lp-line">
				<div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-lp-subtle sm:px-8">
					<p>InsightFlow is operated by {LEGAL.companyName}.</p>
					<Link href="/" className="hover:text-lp-fg">Back to InsightFlow</Link>
				</div>
			</footer>
		</div>
	);
}
