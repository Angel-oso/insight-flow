import type { ReactNode } from "react";
import { Inbox, KanbanSquare, LayoutDashboard } from "lucide-react";

const PROOFS = [
	{
		icon: Inbox,
		title: "One link collects it all",
		body: "Every project gets a public intake link. Senders need no account.",
	},
	{
		icon: KanbanSquare,
		title: "Triage with a clear lifecycle",
		body: "Category, priority, status and owner on every item.",
	},
	{
		icon: LayoutDashboard,
		title: "Decide from the dashboard",
		body: "Volume, urgency and project health at a glance, by role.",
	},
];

export function AuthShell({ children }: { readonly children: ReactNode }) {
	return (
		<div className="min-h-dvh bg-background">
			<div className="mx-auto grid min-h-dvh w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10 lg:px-10 lg:py-10">
				<section
					aria-label="About InsightFlow"
					className="flex flex-col justify-between gap-10 rounded-xl bg-[oklch(0.21_0.025_264)] p-6 text-[oklch(0.985_0_0)] sm:p-8 lg:min-h-[640px] lg:p-10"
				>
					<div className="flex items-center gap-2.5">
						<span
							aria-hidden="true"
							className="flex size-9 items-center justify-center rounded-lg bg-[oklch(0.49_0.2_276)] text-white"
						>
							<Inbox className="size-5" strokeWidth={2.25} />
						</span>
						<span className="font-heading text-base font-semibold tracking-tight">
							InsightFlow
						</span>
					</div>

					<div className="max-w-md">
						<h1 className="font-heading text-3xl leading-[1.15] font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
							Turn feedback into clear, traceable decisions.
						</h1>
						<p className="mt-4 text-sm leading-6 text-white/75">
							One shared place for your team to collect, organize and
							prioritize feedback — so the next thing you build is the right
							thing.
						</p>

						<ul className="mt-8 space-y-5">
							{PROOFS.map((proof) => (
								<li key={proof.title} className="flex gap-3.5">
									<span
										aria-hidden="true"
										className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white"
									>
										<proof.icon className="size-4.5" strokeWidth={2} />
									</span>
									<span>
										<span className="block text-sm font-medium">
											{proof.title}
										</span>
										<span className="mt-0.5 block text-sm leading-5 text-white/70">
											{proof.body}
										</span>
									</span>
								</li>
							))}
						</ul>
					</div>

					<p className="text-xs leading-5 text-white/60">
						Feedback senders never sign in — they use your public project
						link. Accounts are only for your team.
					</p>
				</section>

				<div className="flex items-center justify-center lg:py-6">
					<div className="w-full max-w-md">{children}</div>
				</div>
			</div>
		</div>
	);
}
