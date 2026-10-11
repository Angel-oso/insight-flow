"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";

export function PublicFeedbackForm({ projectSlug }: { readonly projectSlug: string }) {
	const project = useQuery(api.intake.public.form, { projectSlug });
	const submit = useMutation(api.intake.public.submit);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [receipt, setReceipt] = useState<{ reference: string; projectName: string } | null>(null);
	const [category, setCategory] = useState("");
	const heading = useRef<HTMLHeadingElement>(null);
	const submitting = useRef(false);

	useEffect(() => {
		if (receipt) heading.current?.focus();
	}, [receipt]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!project?.accepting || submitting.current) return;
		const fields = new FormData(event.currentTarget);
		const text = (key: string) => String(fields.get(key) ?? "").trim();
		const title = text("title");
		const description = text("description");
		setError(null);
		if (title.length < 3 || title.length > 120) {
			setError("Give your feedback a title between 3 and 120 characters.");
			return;
		}
		if (description.length < 10 || description.length > 5000) {
			setError("Write a description between 10 and 5,000 characters.");
			return;
		}
		submitting.current = true;
		setPending(true);
		try {
			const result = await submit({
				projectSlug, title, description, category: text("category"),
				senderName: text("senderName"), senderEmail: text("senderEmail"), website: text("website"),
			});
			setReceipt({ ...result, projectName: project.name });
		} catch (cause) {
			setError(cause instanceof ConvexError && typeof cause.data === "string"
				? cause.data : "We couldn't send your feedback. Please try again.");
		} finally {
			submitting.current = false;
			setPending(false);
		}
	}

	return (
		<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10 sm:px-6 sm:py-16">
			{receipt ? (
				<Card className="shadow-none">
					<CardContent className="space-y-5 px-5 py-5 sm:px-8">
						<h1 ref={heading} tabIndex={-1} className="font-heading text-2xl font-semibold tracking-tight outline-none">
							Thanks — your feedback reached the {receipt.projectName} team
						</h1>
						<p className="text-sm leading-6 text-muted-foreground">Your feedback is ready for the team to review.</p>
						<p className="break-all text-sm text-muted-foreground">Reference: <span className="font-medium text-foreground">{receipt.reference}</span></p>
						<Button type="button" variant="outline" onClick={() => { setReceipt(null); setCategory(""); setError(null); }}>Send another</Button>
					</CardContent>
				</Card>
			) : project === undefined ? (
				<p role="status" className="py-12 text-muted-foreground">Loading feedback form…</p>
			) : project === null ? (
				<section className="space-y-3 py-12">
					<h1 className="font-heading text-2xl font-semibold tracking-tight">This feedback link doesn&apos;t exist.</h1>
					<p className="text-sm leading-6 text-muted-foreground">Check the link or ask the team for a new one.</p>
				</section>
			) : (
				<>
					<header className="mb-8 space-y-3">
						<h1 className="font-heading text-3xl font-semibold tracking-tight">{project.name}</h1>
						{project.description ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{project.description}</p> : null}
					</header>
					{!project.accepting ? (
						<section className="space-y-3 rounded-xl bg-muted p-6">
							<h2 className="font-heading text-lg font-semibold">This feedback link is currently closed.</h2>
							<p className="text-sm leading-6 text-muted-foreground">The team isn&apos;t accepting new submissions here right now. Please check back later.</p>
						</section>
					) : (
						<Card className="shadow-none">
							<CardContent className="px-5 py-3 sm:px-6">
								<form onSubmit={(event) => void handleSubmit(event)} className="space-y-5" aria-busy={pending}>
									<h2 className="font-heading text-lg font-semibold">Share your feedback</h2>
									<p className="text-sm text-muted-foreground">No account needed. All fields are required unless marked optional.</p>
									<fieldset disabled={pending} className="min-w-0 space-y-5">
										<div className="space-y-2">
											<label htmlFor="intake-title" className="text-sm font-medium">Title</label>
											<Input id="intake-title" name="title" required minLength={3} maxLength={120} aria-describedby="intake-title-hint" />
											<p id="intake-title-hint" className="text-xs text-muted-foreground">A short summary, 3–120 characters.</p>
										</div>
										<div className="space-y-2">
											<label htmlFor="intake-description" className="text-sm font-medium">Description</label>
											<Textarea id="intake-description" name="description" required minLength={10} maxLength={5000} className="min-h-36" aria-describedby="intake-description-hint" />
											<p id="intake-description-hint" className="text-xs text-muted-foreground">What happened, or what would help? 10–5,000 characters.</p>
										</div>
										<div className="space-y-2">
											<label htmlFor="intake-category" className="text-sm font-medium">Category</label>
											<select id="intake-category" name="category" required value={category} onChange={(event) => setCategory(event.target.value)} aria-describedby="intake-category-hint" className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50">
												<option value="" disabled>Choose a category</option>
												{project.categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
											</select>
											<p id="intake-category-hint" className="text-xs text-muted-foreground">{project.categories.find((item) => item.value === category)?.description ?? "Choose the closest match for your feedback."}</p>
										</div>
										<div className="grid gap-5 border-t pt-5 sm:grid-cols-2">
											<div className="space-y-2">
												<label htmlFor="intake-name" className="text-sm font-medium">Name <span className="font-normal text-muted-foreground">(optional)</span></label>
												<Input id="intake-name" name="senderName" autoComplete="name" maxLength={80} aria-describedby="intake-name-hint" />
												<p id="intake-name-hint" className="text-xs text-muted-foreground">Up to 80 characters.</p>
											</div>
											<div className="space-y-2">
												<label htmlFor="intake-email" className="text-sm font-medium">Email <span className="font-normal text-muted-foreground">(optional)</span></label>
												<Input id="intake-email" name="senderEmail" type="email" autoComplete="email" maxLength={254} aria-describedby="intake-email-hint" />
												<p id="intake-email-hint" className="text-xs text-muted-foreground">A valid address, up to 254 characters.</p>
											</div>
										</div>
										<div hidden aria-hidden="true"><input name="website" type="text" tabIndex={-1} autoComplete="off" /></div>
									</fieldset>
									{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
									<Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">{pending ? "Sending…" : "Send feedback"}</Button>
								</form>
							</CardContent>
						</Card>
					)}
				</>
			)}
			<footer className="mt-8 text-center text-xs text-muted-foreground">
				<Link href="/" className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Powered by InsightFlow</Link>
			</footer>
		</main>
	);
}
