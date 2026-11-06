"use client";

import { usePaginatedQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const PAGE_SIZE = 20;

const actionLabels: Record<string, string> = {
	"organization.role_changed": "Role changed",
	"organization.ownership_transferred": "Ownership transferred",
	"organization.member_removed": "Member removed",
	"organization.member_left": "Member left",
	"organization.renamed": "Organization renamed",
	"organization.deletion_requested": "Deletion requested",
	"organization.restored": "Organization restored",
	"project.created": "Project created",
	"project.deletion_requested": "Project deletion requested",
	"project.restored": "Project restored",
	"project.settings_changed": "Project settings changed",
	"project.member_role_changed": "Project role changed",
	"project.member_removed": "Project member removed",
	"project.admin_joined": "Administrator joined project",
	"project.role_created": "Role created",
	"project.role_deleted": "Role deleted",
	"project.feedback_exported": "Feedback exported",
	"project.sender_redacted": "Sender redacted",
	"project.integration_changed": "Integration changed",
	"invitation.created": "Invitation created",
	"invitation.revoked": "Invitation revoked",
	"invitation.accepted": "Invitation accepted",
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Organization audit trail (newest first), for organization administrators. */
export function ActivityLog({ organizationId }: { readonly organizationId: Id<"organizations"> }) {
	const { results, status, loadMore } = usePaginatedQuery(
		api.organizations.queries.auditLog,
		{ organizationId },
		{ initialNumItems: PAGE_SIZE },
	);
	return (
		<Card className="gap-0 rounded-xl py-0 shadow-none ring-foreground/8">
			<CardHeader className="border-b px-5 py-5">
				<h2 className="font-heading text-lg font-semibold">Activity log</h2>
				<p className="text-sm text-muted-foreground">
					Administrative changes in this organization: roles, ownership, members, projects and
					invitations.
				</p>
			</CardHeader>
			<CardContent className="p-0">
				{status === "LoadingFirstPage" ? (
					<p role="status" className="px-5 py-4 text-sm text-muted-foreground">Loading activity…</p>
				) : results.length === 0 ? (
					<p className="px-5 py-4 text-sm text-muted-foreground">No administrative activity yet.</p>
				) : (
					<ol className="divide-y">
						{results.map((entry) => (
							<li key={entry.id} className="space-y-1 px-5 py-3">
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<p className="text-sm font-medium">{actionLabels[entry.action] ?? entry.action}</p>
									<time dateTime={new Date(entry.at).toISOString()} className="text-xs text-muted-foreground">
										{dateFormat.format(entry.at)}
									</time>
								</div>
								<p className="break-words text-sm text-muted-foreground">{entry.summary}</p>
								<p className="text-xs text-muted-foreground">
									By {entry.actorName ?? "System"}
									{entry.targetName && entry.targetName !== entry.actorName ? ` · Affects ${entry.targetName}` : ""}
									{entry.projectName ? ` · ${entry.projectName}` : ""}
								</p>
							</li>
						))}
					</ol>
				)}
			</CardContent>
			{status === "CanLoadMore" || status === "LoadingMore" ? (
				<div className="border-t px-5 py-3">
					<Button variant="outline" size="sm" disabled={status === "LoadingMore"} onClick={() => loadMore(PAGE_SIZE)}>
						{status === "LoadingMore" ? "Loading…" : "Load more"}
					</Button>
				</div>
			) : null}
		</Card>
	);
}
