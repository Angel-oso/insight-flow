"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	presentActivities,
	presentComments,
	presentFeedback,
	type FeedbackUpdate,
} from "./model";

/** Server-side inbox filters (see convex/feedback/queries.ts `list`). */
export type FeedbackListFilters = FunctionArgs<
	typeof api.feedback.queries.list
>["filters"];

/** Rows fetched per server page; the list shows them in smaller pages. */
export const FEEDBACK_LOAD_BATCH = 20;

/** Paginated, filtered inbox items, newest first (or by search relevance). */
export function useFeedbackPage(
	projectSlug: string,
	filters: FeedbackListFilters,
) {
	return usePaginatedQuery(
		api.feedback.queries.list,
		{ projectSlug, filters },
		{ initialNumItems: FEEDBACK_LOAD_BATCH },
	);
}

/**
 * The deep-linked `?feedback=<id>` item, which may not be in the loaded
 * page. Undefined while loading, null when it does not exist here.
 */
export function useSelectedFeedback(
	projectSlug: string,
	selectedId: string | null,
) {
	return useQuery(
		api.feedback.queries.find,
		selectedId ? { projectSlug, feedbackId: selectedId } : "skip",
	);
}

/** Delays a fast-changing value (search typing) before it hits the server. */
export function useDebouncedValue<T>(value: T, delayMs = 250) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

export function useFeedbackClock() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

/** Most items one bulk delete accepts (matches the server). */
export const MAX_BULK_DELETE = 50;

/**
 * Feedback deletion. Both calls throw on failure so the confirmation
 * dialog can show the server's message.
 */
export function useFeedbackDeletion(projectSlug: string) {
	const remove = useMutation(api.feedback.deletion.remove);
	const removeMany = useMutation(api.feedback.deletion.removeMany);
	return {
		deleteOne: async (feedbackId: Id<"feedback">) => {
			await remove({ projectSlug, feedbackId });
		},
		deleteMany: async (feedbackIds: readonly Id<"feedback">[]) =>
			(await removeMany({ projectSlug, feedbackIds: [...feedbackIds] })).deleted,
	};
}

/** Discussion rows per page; "Load older" fetches the next page. */
export const DISCUSSION_PAGE_SIZE = 20;

/**
 * Owns subscriptions and write state; components keep only interaction
 * state. Comments and activity are paginated newest first, so long
 * discussions are never cut off.
 */
export function useFeedbackDetail(
	projectSlug: string,
	feedbackId: Id<"feedback"> | null,
	projectName: string,
	now: number,
	finals: ReadonlySet<string>,
) {
	const args = feedbackId ? { projectSlug, feedbackId } : "skip";
	const data = useQuery(api.feedback.queries.detail, args);
	const comments = usePaginatedQuery(api.feedback.queries.comments, args, {
		initialNumItems: DISCUSSION_PAGE_SIZE,
	});
	const activities = usePaginatedQuery(api.feedback.queries.activities, args, {
		initialNumItems: DISCUSSION_PAGE_SIZE,
	});
	const discussionLoading =
		comments.status === "LoadingFirstPage" || activities.status === "LoadingFirstPage";
	return data && !discussionLoading
		? {
				item: presentFeedback(data.item, projectName, now, finals),
				comments: presentComments(comments.results, now),
				activities: presentActivities(activities.results, now),
				olderComments: {
					canLoad: comments.status === "CanLoadMore",
					loading: comments.status === "LoadingMore",
					load: () => comments.loadMore(DISCUSSION_PAGE_SIZE),
				},
				olderActivities: {
					canLoad: activities.status === "CanLoadMore",
					loading: activities.status === "LoadingMore",
					load: () => activities.loadMore(DISCUSSION_PAGE_SIZE),
				},
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
