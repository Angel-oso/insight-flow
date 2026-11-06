import type { MetadataRoute } from "next";

/**
 * Only the landing and legal pages are meant for search engines. Private
 * app routes need sign-in anyway. Invitation pages (the URL is a secret) and
 * customers' public forms are crawlable on purpose: they send noindex
 * (page metadata plus an X-Robots-Tag header in next.config.ts), which a
 * crawler can only see if robots.txt lets it fetch the page.
 */
export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: "*",
			allow: ["/", "/privacy", "/terms"],
			disallow: [
				"/projects/",
				"/workspace",
				"/home",
				"/feedback",
				"/team",
				"/login",
				"/signup",
				"/monitoring",
			],
		},
	};
}
