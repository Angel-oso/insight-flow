/** Placeholder origin for parsing during server rendering (no `window`). */
const SERVER_ORIGIN = "http://localhost";

/**
 * Same-origin redirect target from an untrusted `next` value, or null.
 * Resolves the value like a browser would (so `//evil.com`, `/\evil.com`,
 * `/%09/evil.com` or `javascript:` are caught) and keeps only the path,
 * query and hash. Use it for every redirect target read from a URL.
 */
export function safeNextPath(next: string | null | undefined): string | null {
	if (!next) return null;
	const origin = typeof window === "undefined" ? SERVER_ORIGIN : window.location.origin;
	let url: URL;
	try {
		url = new URL(next, origin);
	} catch {
		return null;
	}
	if (url.origin !== origin) return null;
	// `https://site//evil.com` is same-origin, but its path would be read as
	// protocol-relative once used as a redirect target on its own.
	if (url.pathname.startsWith("//")) return null;
	return `${url.pathname}${url.search}${url.hash}`;
}

/** `/login?next=…` style link that carries a (sanitized) redirect target. */
export function withNext(path: string, next: string | null | undefined): string {
	const safe = safeNextPath(next);
	return safe ? `${path}?next=${encodeURIComponent(safe)}` : path;
}
