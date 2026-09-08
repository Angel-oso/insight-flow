"use client";

import {
	CircleAlert,
	Clock3,
	MessageSquareText,
	Send,
	UserRound,
} from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import type {
	Assignee,
	FeedbackActivity,
	FeedbackCategory,
	FeedbackComment,
	FeedbackItem,
	FeedbackPriority,
	FeedbackStatus,
} from "./model";
import {
	feedbackCategories,
	feedbackPriorities,
	feedbackStatuses,
} from "./model";
import { FeedbackTag } from "./feedback-meta";

const activityStyles: Record<FeedbackActivity["tone"], string> = {
	neutral: "bg-muted text-muted-foreground",
	primary: "bg-dashboard-primary-soft text-dashboard-primary",
	warning: "bg-dashboard-warning-soft text-dashboard-warning-foreground",
	success: "bg-dashboard-success-soft text-dashboard-success",
};

type Update = Partial<
	Pick<FeedbackItem, "category" | "priority" | "status" | "assigneeId">
>;

export type FeedbackPermissions = {
	readonly canTriage: boolean;
	readonly canAssign: boolean;
	readonly canUpdate: boolean;
	readonly canComment: boolean;
};

function DetailMenu<T extends string>({
	label,
	value,
	displayValue,
	options,
	onValueChange,
	disabled = false,
}: {
	readonly label: string;
	readonly value: T | null;
	readonly displayValue?: string;
	readonly options: readonly {
		readonly label: string;
		readonly value: T | null;
	}[];
	readonly onValueChange: (value: T | null) => void;
	readonly disabled?: boolean;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className="justify-between"
						disabled={disabled}
					>
						<span className="text-muted-foreground">{label}</span>
						<span className="max-w-28 truncate">
							{displayValue ?? value ?? "Unassigned"}
						</span>
					</Button>
				}
			/>
			<DropdownMenuContent className="w-52">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{label}</DropdownMenuLabel>
					{options.map((option) => (
						<DropdownMenuItem
							key={option.value ?? "unassigned"}
							onClick={() => onValueChange(option.value)}
						>
							{option.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function DetailField({
	label,
	children,
}: {
	readonly label: string;
	readonly children: React.ReactNode;
}) {
	return (
		<div>
			<p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
				{label}
			</p>
			<div className="mt-2">{children}</div>
		</div>
	);
}

export function FeedbackDetail({
	item,
	assignees,
	comments,
	activities,
	permissions,
	onUpdate,
	onAddComment,
	loading,
	pending,
}: {
	readonly item: FeedbackItem | null;
	readonly loading: boolean;
	readonly pending: boolean;
	readonly assignees: readonly Assignee[];
	readonly comments: readonly FeedbackComment[];
	readonly activities: readonly FeedbackActivity[];
	readonly permissions: FeedbackPermissions;
	readonly onUpdate: (
		id: FeedbackItem["id"],
		update: Update,
	) => Promise<boolean>;
	readonly onAddComment: (
		id: FeedbackItem["id"],
		body: string,
	) => Promise<boolean>;
}) {
	const [note, setNote] = useState("");

	if (!item) {
		return (
			<aside className="flex min-h-80 flex-col items-start justify-center p-6">
				<MessageSquareText className="size-5 text-dashboard-primary" />
				<h2 className="mt-4 font-heading text-lg font-semibold">
					Choose an item
				</h2>
				<p className="mt-1 text-sm leading-6 text-muted-foreground">
					Select feedback from the queue to classify it, assign an owner, and
					add internal context.
				</p>
			</aside>
		);
	}

	const assignee = assignees.find(
		(candidate) => candidate.id === item.assigneeId,
	);
	const categoryOptions = feedbackCategories.map((category) => ({
		label: category,
		value: category,
	}));
	const priorityOptions = feedbackPriorities.map((priority) => ({
		label: priority,
		value: priority,
	}));
	const statusOptions = feedbackStatuses.map((status) => ({
		label: status,
		value: status,
	}));
	const assigneeOptions = [
		{ label: "Unassigned", value: null },
		...assignees.map((candidate) => ({
			label: candidate.name,
			value: candidate.id,
		})),
	];

	const submitNote = async () => {
		const body = note.trim();
		if (!body) return;

		if (await onAddComment(item.id, body)) setNote("");
	};

	return (
		<aside className="min-w-0 bg-card lg:border-l">
			<div className="border-b p-5">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<p className="text-xs font-medium text-muted-foreground">
							{item.project} · Received {item.receivedAt}
						</p>
						<h2 className="mt-2 font-heading text-xl font-semibold tracking-[-0.025em]">
							{item.title}
						</h2>
					</div>
					{item.priority === "Critical" ? (
						<CircleAlert className="mt-1 size-5 shrink-0 text-dashboard-danger" />
					) : null}
				</div>
				<div className="mt-4 flex flex-wrap gap-2">
					<FeedbackTag value={item.category} kind="category" />
					<FeedbackTag value={item.priority} kind="priority" />
					<FeedbackTag value={item.status} kind="status" />
					{item.isStale ? (
						<span className="inline-flex h-6 items-center rounded-md bg-dashboard-warning-soft px-2 text-xs font-medium text-dashboard-warning-foreground">
							Stale · {item.inactiveDays} days
						</span>
					) : null}
				</div>
			</div>

			<div className="space-y-6 p-5">
				<section>
					<h3 className="font-heading text-sm font-semibold">
						Feedback context
					</h3>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">
						{item.description}
					</p>
				</section>

				<section className="grid gap-4 border-y py-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
					<DetailField label="Category">
						<DetailMenu<FeedbackCategory>
							label="Category"
							value={item.category}
							options={categoryOptions}
							disabled={!permissions.canTriage}
							onValueChange={(category) =>
								onUpdate(item.id, { category: category ?? item.category })
							}
						/>
					</DetailField>
					<DetailField label="Priority">
						<DetailMenu<FeedbackPriority>
							label="Priority"
							value={item.priority}
							options={priorityOptions}
							disabled={!permissions.canTriage}
							onValueChange={(priority) =>
								onUpdate(item.id, { priority: priority ?? item.priority })
							}
						/>
					</DetailField>
					<DetailField label="Status">
						<DetailMenu<FeedbackStatus>
							label="Status"
							value={item.status}
							options={statusOptions}
							disabled={!permissions.canUpdate}
							onValueChange={(status) =>
								onUpdate(item.id, { status: status ?? item.status })
							}
						/>
					</DetailField>
					<DetailField label="Owner">
						<DetailMenu<Assignee["id"]>
							label="Owner"
							value={item.assigneeId}
							displayValue={assignee?.name}
							options={assigneeOptions}
							disabled={!permissions.canAssign}
							onValueChange={(assigneeId) => {
								void onUpdate(item.id, { assigneeId });
							}}
						/>
					</DetailField>
				</section>

				<section className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
					<div className="flex items-start gap-2">
						<UserRound className="mt-0.5 size-4 text-muted-foreground" />
						<div>
							<p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
								Sender
							</p>
							<p className="mt-1 font-medium">
								{item.sender?.name ?? "Anonymous"}
							</p>
							<p className="text-xs text-muted-foreground">
								{item.sender?.email ?? "No email shared"}
							</p>
						</div>
					</div>
					<div className="flex items-start gap-2">
						<Clock3 className="mt-0.5 size-4 text-muted-foreground" />
						<div>
							<p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
								Last activity
							</p>
							<p className="mt-1 font-medium">{item.updatedAt}</p>
							<p className="text-xs text-muted-foreground">
								{assignee ? `Owned by ${assignee.name}` : "No owner assigned"}
							</p>
						</div>
					</div>
				</section>

				<section>
					<div className="flex items-center justify-between gap-3">
						<h3 className="font-heading text-sm font-semibold">
							Internal discussion
						</h3>
						<span className="text-xs text-muted-foreground">
							Shared demo discussion
						</span>
					</div>
					<div className="mt-3 space-y-3">
						{loading ? (
							<p role="status" className="text-sm text-muted-foreground">
								Loading discussion…
							</p>
						) : comments.length > 0 ? (
							comments.map((comment) => (
								<div key={comment.id} className="flex gap-3">
									<Avatar className="mt-0.5 size-7">
										<AvatarFallback className="bg-dashboard-primary-soft text-dashboard-primary">
											{comment.initials}
										</AvatarFallback>
									</Avatar>
									<div className="min-w-0 flex-1">
										<p className="text-xs font-medium">
											{comment.author}
											<span className="ml-2 font-normal text-muted-foreground">
												{comment.time}
											</span>
										</p>
										<p className="mt-1 text-sm leading-6 text-muted-foreground">
											{comment.body}
										</p>
									</div>
								</div>
							))
						) : (
							<p className="text-sm text-muted-foreground">
								No internal context has been added yet.
							</p>
						)}
					</div>
					<div className="mt-4 space-y-2">
						<Textarea
							aria-label="Add an internal note"
							value={note}
							maxLength={5000}
							onChange={(event) => setNote(event.target.value)}
							disabled={!permissions.canComment}
							placeholder="Add context, a decision, or a handoff for your team…"
						/>
						<Button
							size="sm"
							onClick={submitNote}
							disabled={!permissions.canComment || note.trim().length === 0}
						>
							<Send data-icon="inline-start" />
							{pending ? "Saving…" : "Add internal note"}
						</Button>
					</div>
				</section>

				<section className="border-t pt-5">
					<h3 className="font-heading text-sm font-semibold">Activity</h3>
					<p className="text-xs text-muted-foreground">Latest 100 entries</p>
					<div className="mt-3 space-y-3">
						{loading ? (
							<p role="status" className="text-sm text-muted-foreground">
								Loading activity…
							</p>
						) : activities.length > 0 ? (
							activities.map((activity) => (
								<div key={activity.id} className="flex gap-3 text-sm">
									<span
										className={`mt-1.5 size-2 shrink-0 rounded-full ${activityStyles[activity.tone]}`}
									/>
									<div>
										<p>{activity.message}</p>
										<p className="mt-0.5 text-xs text-muted-foreground">
											{activity.time}
										</p>
									</div>
								</div>
							))
						) : (
							<p className="text-sm text-muted-foreground">
								No activity has been recorded for this item yet.
							</p>
						)}
					</div>
				</section>
			</div>
		</aside>
	);
}
