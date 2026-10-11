"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Taxonomies } from "@/lib/taxonomy";


function byRank<T extends { readonly rank: number }>(items: readonly T[]) {
	return [...items].sort((a, b) => a.rank - b.rank);
}

/**
 * Lets triagers capture feedback that arrived outside the public link
 * (calls, email, meetings) so the inbox stays the single source of truth.
 */
export function LogFeedback({
	projectSlug,
	defaultPriority,
	taxonomies,
	onLogged,
}: {
	readonly projectSlug: string;
	readonly defaultPriority: string;
	readonly taxonomies: Taxonomies;
	readonly onLogged: (feedbackId: Id<"feedback">) => void;
}) {
	const create = useMutation(api.feedback.mutations.create);
	const categories = byRank(taxonomies.categories);
	const priorities = byRank(taxonomies.priorities);
	const initialPriority = priorities.some((item) => item.value === defaultPriority)
		? defaultPriority
		: (priorities[0]?.value ?? "");
	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [category, setCategory] = useState(categories[0]?.value ?? "");
	const [priority, setPriority] = useState(initialPriority);
	const [senderName, setSenderName] = useState("");
	const [senderEmail, setSenderEmail] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function reset() {
		setTitle("");
		setDescription("");
		setCategory(categories[0]?.value ?? "");
		setPriority(initialPriority);
		setSenderName("");
		setSenderEmail("");
		setError(null);
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError(null);
		try {
			const { feedbackId } = await create({
				projectSlug,
				title,
				description,
				category,
				priority,
				...(senderName.trim() ? { senderName } : {}),
				...(senderEmail.trim() ? { senderEmail } : {}),
			});
			reset();
			setOpen(false);
			onLogged(feedbackId);
		} catch (cause) {
			setError(
				cause instanceof ConvexError && typeof cause.data === "string"
					? cause.data
					: "Could not log this feedback. Please try again.",
			);
		} finally {
			setPending(false);
		}
	}

	return (
		<>
			<Button size="sm" onClick={() => setOpen(true)}>
				<Plus data-icon="inline-start" />
				Log feedback
			</Button>
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
					<form onSubmit={handleSubmit} className="flex min-h-full flex-col">
						<SheetHeader>
							<SheetTitle>Log feedback</SheetTitle>
							<SheetDescription>
								Capture feedback that reached the team by call, email, or meeting.
								It enters the inbox like a public submission.
							</SheetDescription>
						</SheetHeader>
						<div className="grid gap-4 px-4 py-2">
							<label htmlFor="log-title" className="grid gap-2 text-sm font-medium">
								Title
								<Input
									id="log-title"
									value={title}
									onChange={(event) => setTitle(event.target.value)}
									minLength={3}
									maxLength={120}
									required
									autoFocus
								/>
							</label>
							<label htmlFor="log-description" className="grid gap-2 text-sm font-medium">
								Description
								<Textarea
									id="log-description"
									value={description}
									onChange={(event) => setDescription(event.target.value)}
									minLength={10}
									maxLength={5000}
									rows={5}
									required
								/>
								<span className="text-xs font-normal text-muted-foreground">
									At least 10 characters. Include who raised it and the context.
								</span>
							</label>
							<div className="grid gap-4 sm:grid-cols-2">
								<label htmlFor="log-category" className="grid gap-2 text-sm font-medium">
									Category
									<Select
										items={categories}
										value={category}
										onValueChange={(value) => value && setCategory(value)}
									>
										<SelectTrigger id="log-category" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{categories.map((item) => (
												<SelectItem key={item.value} value={item.value}>
													{item.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</label>
								<label htmlFor="log-priority" className="grid gap-2 text-sm font-medium">
									Priority
									<Select
										items={priorities}
										value={priority}
										onValueChange={(value) => value && setPriority(value)}
									>
										<SelectTrigger id="log-priority" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{priorities.map((item) => (
												<SelectItem key={item.value} value={item.value}>
													{item.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</label>
							</div>
							<fieldset className="grid gap-3 rounded-lg border p-3">
								<legend className="px-1 text-sm font-medium">
									Sender <span className="font-normal text-muted-foreground">(optional)</span>
								</legend>
								<label htmlFor="log-sender-name" className="grid gap-2 text-sm">
									Name
									<Input
										id="log-sender-name"
										value={senderName}
										onChange={(event) => setSenderName(event.target.value)}
										maxLength={80}
										autoComplete="off"
									/>
								</label>
								<label htmlFor="log-sender-email" className="grid gap-2 text-sm">
									Email
									<Input
										id="log-sender-email"
										type="email"
										value={senderEmail}
										onChange={(event) => setSenderEmail(event.target.value)}
										maxLength={254}
										autoComplete="off"
									/>
								</label>
							</fieldset>
							{error ? (
								<p role="alert" className="text-sm text-destructive">
									{error}
								</p>
							) : null}
						</div>
						<SheetFooter className="mt-auto">
							<Button type="button" variant="outline" onClick={() => setOpen(false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={pending}>
								{pending ? "Logging…" : "Log feedback"}
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>
		</>
	);
}
