"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { capabilities, type Capability } from "@/lib/auth/permissions";

const labels: Record<Capability, string> = {
	"feedback.view": "View feedback",
	"feedback.triage": "Triage feedback",
	"feedback.assign": "Assign feedback",
	"feedback.update": "Update feedback",
	"feedback.comment": "Comment on feedback",
	"project.view": "View project",
	"project.manage": "Manage project settings",
	"team.view": "View team",
	"team.manage": "Invite team members",
	"organization.manage": "Manage roles and workspace",
};

const configurableCapabilities = capabilities.filter(
	(capability) => capability !== "organization.manage",
);

export function RoleManager({ projectSlug, disabled }: { readonly projectSlug: string; readonly disabled: boolean }) {
	const data = useQuery(api.projects.settings.roles, { projectSlug });
	const createRole = useMutation(api.projects.settings.createRole);
	const deleteRole = useMutation(api.projects.settings.deleteRole);
	const [name, setName] = useState("");
	const [permissionKeys, setPermissionKeys] = useState<Capability[]>([
		"feedback.update",
		"feedback.comment",
	]);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!data) return null;

	function togglePermission(capability: Capability) {
		setPermissionKeys((current) => current.includes(capability)
			? current.filter((item) => item !== capability)
			: [...current, capability]);
	}

	async function handleCreate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError(null);
		try {
			await createRole({ projectSlug, name, permissionKeys });
			setName("");
			setPermissionKeys(["feedback.update", "feedback.comment"]);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not create this role.");
		} finally {
			setPending(false);
		}
	}

	async function handleDelete(roleId: ProjectRoleId, roleName: string) {
		if (!window.confirm(`Delete ${roleName}? Assigned members will become Members.`)) return;
		setPending(true);
		setError(null);
		try {
			await deleteRole({ projectSlug, roleId });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not delete this role.");
		} finally {
			setPending(false);
		}
	}

	return (
		<Card className="gap-0 py-0 shadow-none">
			<CardHeader className="border-b px-5 py-5 sm:px-6">
				<CardTitle>Roles</CardTitle>
				<CardDescription>
					Create project-specific roles. Deleting one moves its members and pending invitations to Member.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5 px-5 py-5 sm:px-6">
				<div className="space-y-2">
					{data.roles.map((role) => (
						<div key={role.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3">
							<div>
								<p className="font-medium">{role.name}</p>
								<p className="mt-1 text-xs text-muted-foreground">
									{role.builtIn ? "Protected built-in role" : role.permissionKeys.map((key) => labels[key]).join(" · ")}
								</p>
							</div>
							{role.builtIn ? null : (
								<Button type="button" size="sm" variant="outline" disabled={disabled || pending} onClick={() => void handleDelete(role.id, role.name)}>
									<Trash2 data-icon="inline-start" /> Delete
								</Button>
							)}
						</div>
					))}
				</div>
				<form className="space-y-4 border-t pt-5" onSubmit={(event) => void handleCreate(event)}>
					<label className="grid gap-2 text-sm font-medium" htmlFor="role-name">
						New role name
						<Input id="role-name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} disabled={disabled || pending} placeholder="e.g. Support lead" />
					</label>
					<fieldset className="grid gap-2 sm:grid-cols-2">
						<legend className="text-sm font-medium">Permissions</legend>
						{configurableCapabilities.map((capability) => {
							const required = ["feedback.view", "project.view", "team.view"] as const;
							const isRequired = required.includes(capability as (typeof required)[number]);
							return (
								<label key={capability} className="flex items-center gap-2 text-sm text-muted-foreground">
									<input type="checkbox" checked={isRequired || permissionKeys.includes(capability)} disabled={disabled || pending || isRequired} onChange={() => togglePermission(capability)} />
									{labels[capability]}{isRequired ? " (required)" : ""}
								</label>
							);
						})}
					</fieldset>
					{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
					<Button type="submit" disabled={disabled || pending || name.trim().length < 2}>
						<Plus data-icon="inline-start" /> {pending ? "Saving…" : "Create role"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

type ProjectRoleId = Id<"roles">;
