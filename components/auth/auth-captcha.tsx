"use client";

import { useCallback, useState } from "react";
import { TURNSTILE_SITE_KEY, TurnstileWidget } from "@/components/intake/turnstile";

/** Widget action; the server (convex/email/authGuards.ts) checks it. */
const AUTH_TURNSTILE_ACTION = "auth";

export const CAPTCHA_REQUIRED = "Complete the human check below and try again.";

/** Extra `signIn` params carrying the Turnstile token, if there is one. */
export type CaptchaParams = { turnstileToken?: string };

/**
 * Turnstile for the auth flows that email a code (sign-up, resend, password
 * reset, sign-in of an unverified account). Without a site key nothing is
 * rendered and `ready` is always true; the server then only accepts the
 * request on deployments with the captcha explicitly disabled.
 */
export function useAuthCaptcha() {
	const [token, setToken] = useState<string | null>(null);
	const [resetKey, setResetKey] = useState(0);
	const enabled = Boolean(TURNSTILE_SITE_KEY);

	/** Params for the next request; the single-use token is then replaced. */
	const take = useCallback((): CaptchaParams => {
		if (!enabled) return {};
		setToken(null);
		setResetKey((key) => key + 1);
		return token ? { turnstileToken: token } : {};
	}, [enabled, token]);

	const widget = enabled ? (
		<TurnstileWidget
			siteKey={TURNSTILE_SITE_KEY}
			action={AUTH_TURNSTILE_ACTION}
			resetKey={resetKey}
			onToken={setToken}
		/>
	) : null;

	return { ready: !enabled || token !== null, take, widget };
}
