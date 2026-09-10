"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	presentDiscussion,
	presentFeedback,
	type FeedbackUpdate,
} from "./model";

export function useFeedbackClock() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

/** Owns subscriptions and write state; components keep only interaction state. */
export function useFeedbackDetail(
	projectSlug: string,
	feedbackId: Id<"feedback"> | null,
	projectName: string,
	now: number,
	finals: ReadonlySet<string>,
) {
	const data = useQuery(
		api.feedback.queries.detail,
		feedbackId ? { projectSlug, feedbackId } : "skip",
	);
	return data
		? {
				item: presentFeedback(data.item, projectName, now, finals),
				...presentDiscussion(data, now),
			}
		: undefined;
}

export function useFeedbackWrites(projectSlug: string) {
	const update = useMutation(api.feedback.mutations.update);
	const comment = useMutation(api.feedback.mutations.addComment);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inFlight = useRef(false);

	async function save(operation: () => Promise<null>) {
		if (inFlight.current) return false;
		inFlight.current = true;
		setPending(true);
		setError(null);
		try {
			await operation();
			return true;
		} catch (cause) {
			setError(
				cause instanceof ConvexError && typeof cause.data === "string"
					? cause.data
					: "Could not save your change. Please try again.",
			);
			return false;
		} finally {
			inFlight.current = false;
			setPending(false);
		}
	}

	return {
		pending,
		error,
		updateFeedback: (feedbackId: Id<"feedback">, changes: FeedbackUpdate) =>
			save(() => update({ projectSlug, feedbackId, changes })),
		addComment: (feedbackId: Id<"feedback">, body: string) => {
			const text = body.trim();
			if (!text || text.length > 5000) {
				setError("Write a note between 1 and 5,000 characters.");
				return Promise.resolve(false);
			}
			return save(() => comment({ projectSlug, feedbackId, body: text }));
		},
	};
}
