/**
 * Webhook destination checks (SSRF hardening, best effort).
 *
 * Rejected: anything but https on the default port, credentials in the URL,
 * localhost / single-label / internal-looking names, cloud metadata hosts,
 * every IPv6 literal, and IPv4 literals in private, loopback, link-local,
 * CGNAT, benchmark, multicast or reserved ranges. The WHATWG URL parser
 * normalizes decimal/hex/octal IPv4 spellings ("2130706433", "0x7f.1") to
 * dotted form first, so those cannot sneak past.
 *
 * Limits: a public hostname can still resolve to a private address (or be
 * re-pointed after validation — DNS rebinding). Convex functions cannot
 * resolve DNS or pin the connected IP, so this check cannot close that gap;
 * deliveries also refuse redirects, time out after 5s and never return the
 * response body to users, which keeps a successful probe nearly blind.
 */
const BLOCKED_SUFFIXES = [
	".localhost",
	".local",
	".internal",
	".intranet",
	".lan",
	".home",
	".corp",
	".private",
	".localdomain",
	".home.arpa",
	".in-addr.arpa",
	".ip6.arpa",
];
const BLOCKED_HOSTS = new Set([
	"localhost",
	"metadata",
	"metadata.google.internal",
	"metadata.goog",
	"instance-data",
	"kubernetes.default",
	"kubernetes.default.svc",
]);

/** CIDR ranges that are never valid webhook targets. */
const BLOCKED_V4: readonly [string, number][] = [
	["0.0.0.0", 8], // "this" network
	["10.0.0.0", 8], // private
	["100.64.0.0", 10], // carrier-grade NAT
	["127.0.0.0", 8], // loopback
	["169.254.0.0", 16], // link-local, cloud metadata (169.254.169.254)
	["172.16.0.0", 12], // private
	["192.0.0.0", 24], // IETF protocol assignments
	["192.0.2.0", 24], // documentation
	["192.88.99.0", 24], // 6to4 relay
	["192.168.0.0", 16], // private
	["198.18.0.0", 15], // benchmarking
	["198.51.100.0", 24], // documentation
	["203.0.113.0", 24], // documentation
	["224.0.0.0", 4], // multicast
	["240.0.0.0", 4], // reserved + broadcast
];

const MAX_URL_LENGTH = 2048;

function ipv4ToInt(ip: string) {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	let value = 0;
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		const octet = Number(part);
		if (octet > 255) return null;
		value = value * 256 + octet;
	}
	return value;
}

export function isBlockedIpv4(ip: string) {
	const value = ipv4ToInt(ip);
	if (value === null) return false;
	return BLOCKED_V4.some(([base, bits]) => {
		const size = 2 ** (32 - bits);
		const start = ipv4ToInt(base)!;
		return value >= start && value < start + size;
	});
}

/**
 * Returns the normalized URL, or an error message for the user.
 */
export function validateWebhookUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
	const input = raw.trim();
	if (!input || input.length > MAX_URL_LENGTH)
		return { ok: false, error: `Enter a URL of at most ${MAX_URL_LENGTH} characters.` };
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return { ok: false, error: "Enter a valid URL, starting with https://." };
	}
	if (url.protocol !== "https:") return { ok: false, error: "Webhook URLs must use https://." };
	if (url.username || url.password)
		return { ok: false, error: "Remove the username and password from the URL." };
	if (url.port && url.port !== "443")
		return { ok: false, error: "Webhook URLs must use the default HTTPS port." };
	const host = url.hostname.toLowerCase().replace(/\.$/, "");
	if (host.startsWith("[") || host.includes(":"))
		return { ok: false, error: "Use a hostname instead of an IPv6 address." };
	if (ipv4ToInt(host) !== null) {
		if (isBlockedIpv4(host))
			return { ok: false, error: "Private, loopback and reserved addresses are not allowed." };
	} else {
		if (
			!host.includes(".") ||
			BLOCKED_HOSTS.has(host) ||
			BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))
		)
			return { ok: false, error: "Use a public hostname for the webhook." };
		// Purely numeric labels that were not a valid IPv4 address.
		if (/^[\d.]+$/.test(host)) return { ok: false, error: "Enter a valid URL, starting with https://." };
	}
	url.hash = "";
	return { ok: true, url: url.toString() };
}
