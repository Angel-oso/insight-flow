import { Globe, Inbox, LayoutDashboard, UserCheck } from "lucide-react";

const steps = [
	{
		icon: Globe,
		title: "Collect",
		body: "A customer, colleague, or client sends feedback through the project's public link.",
	},
	{
		icon: Inbox,
		title: "Organize",
		body: "It lands in the project inbox with a status, a category, and the project's default priority.",
	},
	{
		icon: UserCheck,
		title: "Own",
		body: "A coordinator assigns an owner, who adds context and moves it through the lifecycle.",
	},
	{
		icon: LayoutDashboard,
		title: "Decide",
		body: "Leaders see volume, urgency, and project health, and know where to intervene.",
	},
] as const;

/** The workflow as a circuit: four nodes on one line with light running along it. */
export function LandingWorkflow() {
	return (
		<section id="workflow" aria-labelledby="workflow-title" className="scroll-mt-20 border-t border-lp-line">
			<div className="mx-auto max-w-[1200px] px-4 py-24 sm:px-8 sm:py-32">
				<h2 id="workflow-title" className="mx-auto max-w-3xl text-balance text-center font-display text-3xl font-semibold tracking-[-0.035em] sm:text-[2.5rem] sm:leading-[1.1]">
					From a link to a decision, in one workflow
				</h2>
				<div className="relative mt-16">
					<div aria-hidden="true" className="absolute top-6 right-[12.5%] left-[12.5%] hidden h-px overflow-hidden bg-lp-line-strong lg:block">
						<div className="lp-travel h-px w-1/4 bg-gradient-to-r from-transparent via-lp-accent to-transparent" />
					</div>
					<div aria-hidden="true" className="absolute top-6 bottom-6 left-6 w-px overflow-hidden bg-lp-line-strong lg:hidden">
						<div className="lp-travel-down h-1/4 w-px bg-gradient-to-b from-transparent via-lp-accent to-transparent" />
					</div>
					<ol className="relative grid gap-10 lg:grid-cols-4 lg:gap-6">
					{steps.map((step) => (
						<li key={step.title} className="relative flex gap-5 lg:flex-col lg:items-center lg:gap-0 lg:text-center">
							<span className="relative grid size-12 shrink-0 place-items-center rounded-full border border-lp-line-strong bg-lp-surface text-lp-accent">
								<step.icon aria-hidden="true" className="size-5" strokeWidth={1.6} />
							</span>
							<div className="lg:mt-6">
								<h3 className="font-display text-lg font-semibold tracking-[-0.02em]">{step.title}</h3>
								<p className="mt-2 max-w-[34ch] text-sm leading-6 text-lp-muted lg:mx-auto">{step.body}</p>
							</div>
						</li>
					))}
					</ol>
				</div>
			</div>
		</section>
	);
}
