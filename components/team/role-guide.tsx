import { CircleAlert, ShieldCheck, UsersRound } from "lucide-react";

const roles = [
	{
		name: "Administrator",
		description:
			"Owns the organization, its members, projects, public links, and organization-wide decisions.",
		icon: ShieldCheck,
	},
	{
		name: "Manager",
		description:
			"Coordinates assigned projects: triages feedback, assigns owners, and monitors operational work.",
		icon: UsersRound,
	},
	{
		name: "Member",
		description:
			"Works on allowed projects, updates assigned feedback, and adds the context needed to move work forward.",
		icon: CircleAlert,
	},
] as const;

export function RoleGuide() {
	return (
		<section className="rounded-xl bg-card ring-1 ring-foreground/10">
			<div className="border-b p-5">
				<h2 className="font-heading text-lg font-semibold tracking-[-0.025em]">
					Roles and access
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Access stays simple in the MVP: role and project scope determine what
					people can do.
				</p>
			</div>
			<dl className="divide-y">
				{roles.map((role) => (
					<div key={role.name} className="flex gap-3 p-5">
						<role.icon className="mt-0.5 size-4 shrink-0 text-dashboard-primary" />
						<div>
							<dt className="font-medium">{role.name}</dt>
							<dd className="mt-1 text-sm leading-6 text-muted-foreground">
								{role.description}
							</dd>
						</div>
					</div>
				))}
			</dl>
		</section>
	);
}
