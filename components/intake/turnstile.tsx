"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

/** Public Turnstile site key; when unset the widget is not rendered. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileOptions = {
	sitekey: string;
	action?: string;
	theme?: "auto" | "light" | "dark";
	callback?: (token: string) => void;
	"expired-callback"?: () => void;
	"error-callback"?: () => void;
	"timeout-callback"?: () => void;
};

declare global {
	interface Window {
		turnstile?: {
			render: (container: HTMLElement, options: TurnstileOptions) => string;
			remove: (widgetId: string) => void;
		};
	}
}

/**
 * Cloudflare Turnstile, rendered explicitly. Tokens are single-use: change
 * `resetKey` after every submission attempt to get a fresh challenge.
 */
export function TurnstileWidget({ siteKey, action, resetKey, onToken }: {
	readonly siteKey: string;
	readonly action: string;
	readonly resetKey: number;
	readonly onToken: (token: string | null) => void;
}) {
	const container = useRef<HTMLDivElement>(null);
	const onTokenRef = useRef(onToken);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		onTokenRef.current = onToken;
	}, [onToken]);

	useEffect(() => {
		const turnstile = window.turnstile;
		if (!ready || !turnstile || !container.current) return;
		onTokenRef.current(null);
		const widgetId = turnstile.render(container.current, {
			sitekey: siteKey,
			action,
			theme: "auto",
			callback: (token) => onTokenRef.current(token),
			"expired-callback": () => onTokenRef.current(null),
			"error-callback": () => onTokenRef.current(null),
			"timeout-callback": () => onTokenRef.current(null),
		});
		return () => turnstile.remove(widgetId);
	}, [ready, siteKey, action, resetKey]);

	return (
		<>
			<Script src={TURNSTILE_SCRIPT} strategy="afterInteractive" onReady={() => setReady(true)} />
			<div ref={container} className="min-h-[65px]" />
		</>
	);
}
