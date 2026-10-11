"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const subscribe = () => () => {};
const browserOrigin = () => window.location.origin;
const serverOrigin = () => "";

export function PublicLink({ slug, accepting }: {
	readonly slug: string;
	readonly accepting: boolean;
}) {
	// The server and hydration paint both use an empty origin; React reads the
	// browser snapshot after mount, so no server/client URL mismatch is possible.
	const origin = useSyncExternalStore(subscribe, browserOrigin, serverOrigin);
	const url = origin ? `${origin}/f/${encodeURIComponent(slug)}` : "";
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => () => {
		if (timer.current) clearTimeout(timer.current);
	}, []);

	async function copy() {
		setError(null);
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(() => setCopied(false), 2000);
		} catch {
			setError("Couldn't copy the link. Select the address and copy it manually.");
		}
	}

	return (
		<div className="space-y-3 py-4 last:pb-0">
			<label htmlFor="settings-public-link" className="text-sm font-medium">Public feedback link</label>
			<p className="text-sm leading-6 text-muted-foreground">Share this link to collect feedback without an account.</p>
			<div className="flex flex-col gap-2 sm:flex-row">
				<Input id="settings-public-link" value={url} readOnly placeholder="Loading public link…" className="min-w-0 flex-1" onFocus={(event) => event.target.select()} />
				<div className="flex gap-2">
					<Button type="button" variant="outline" disabled={!url} onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</Button>
					{url ? <a href={url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })} aria-label="Open public feedback link in a new tab">Open</a> : null}
				</div>
			</div>
			<span role="status" className="sr-only">{copied ? "Public feedback link copied." : ""}</span>
			{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
			{!accepting ? <p className="text-sm leading-6 text-muted-foreground">This link is currently closed. Submissions are accepted only when the project is active and feedback intake is enabled.</p> : null}
		</div>
	);
}
