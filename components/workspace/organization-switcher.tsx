import { Building2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

type Organizations = FunctionReturnType<typeof api.organizations.queries.mine>;

export function OrganizationSwitcher({ organization, organizations, onChange }: {
	readonly organization: Organizations[number];
	readonly organizations: Organizations;
	readonly onChange: (id: string) => void;
}) {
	if (organizations.length < 2) return null;
	return <DropdownMenu>
		<DropdownMenuTrigger render={<Button variant="outline" className="max-w-full" aria-label={`Organization: ${organization.name}`}><Building2 /><span className="truncate">{organization.name}</span><ChevronDown /></Button>} />
		<DropdownMenuContent align="start" className="max-w-xs">
			<DropdownMenuGroup>
				<DropdownMenuLabel>Organizations</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={organization.id} onValueChange={onChange}>
					{organizations.map((org) => <DropdownMenuRadioItem key={org.id} value={org.id}>{org.name}</DropdownMenuRadioItem>)}
				</DropdownMenuRadioGroup>
			</DropdownMenuGroup>
		</DropdownMenuContent>
	</DropdownMenu>;
}
