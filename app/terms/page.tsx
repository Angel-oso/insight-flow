import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import { LEGAL } from "@/lib/legal";

/*
 * Company-specific values live in lib/legal.ts (run `pnpm check:legal`).
 * Have the final text reviewed by counsel before launch.
 */

export const metadata: Metadata = {
	title: "Terms of Service — InsightFlow",
	description: "The terms that govern the use of InsightFlow.",
};

export default function TermsPage() {
	return (
		<LegalDocument title="Terms of Service" updated={LEGAL.effectiveDate}>
			<section>
				<p>
					These Terms of Service (&ldquo;Terms&rdquo;) govern your use of InsightFlow (the
					&ldquo;Service&rdquo;), provided by <strong>{LEGAL.companyName}</strong> (&ldquo;we&rdquo;,
					&ldquo;us&rdquo;). By creating an account or using the Service you agree to these
					Terms. If you use the Service on behalf of an organization, you confirm that you can
					accept these Terms for it.
				</p>
			</section>

			<section aria-labelledby="accounts">
				<h2 id="accounts">Accounts</h2>
				<p>
					You must provide accurate information and keep your credentials secure. You are
					responsible for activity under your account and for the people you invite to your
					organization. Tell us promptly at <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>{" "}
					if you suspect unauthorized access.
				</p>
			</section>

			<section aria-labelledby="customer-data">
				<h2 id="customer-data">Your content and feedback data</h2>
				<p>
					You keep all rights to the content that you, and the people using your public
					feedback links, put into the Service (&ldquo;Customer Data&rdquo;). You grant us a
					limited license to host and process Customer Data only to provide and secure the
					Service. You are responsible for having a lawful basis to collect feedback, including
					any names and email addresses submitters choose to provide, and for telling
					submitters how you use it. Our <Link href="/privacy">Privacy Policy</Link> describes
					how we handle personal data.
				</p>
			</section>

			<section aria-labelledby="acceptable-use">
				<h2 id="acceptable-use">Acceptable use</h2>
				<p>You agree not to:</p>
				<ul>
					<li>use the Service for unlawful, harmful, or deceptive purposes;</li>
					<li>upload malware or content that infringes the rights of others;</li>
					<li>send spam or automated submissions through public feedback links;</li>
					<li>probe, overload, or circumvent the security or rate limits of the Service;</li>
					<li>access another organization&rsquo;s data without authorization.</li>
				</ul>
				<p>We may suspend accounts or public links that violate these rules.</p>
			</section>

			<section aria-labelledby="fees">
				<h2 id="fees">Fees</h2>
				<p>
					{LEGAL.fees} We will give reasonable notice before introducing or
					changing fees.
				</p>
			</section>

			<section aria-labelledby="availability">
				<h2 id="availability">Availability and changes</h2>
				<p>
					We work to keep the Service available and secure, but it is provided &ldquo;as
					is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind to the extent
					permitted by law. We may change or discontinue features; for material changes that
					reduce functionality, we will give reasonable notice.
				</p>
			</section>

			<section aria-labelledby="termination">
				<h2 id="termination">Termination and data deletion</h2>
				<p>
					You can stop using the Service and request deletion of your account at any time by
					writing to <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>. We may suspend or
					terminate access for a material breach of these Terms. After termination, we delete
					Customer Data within {LEGAL.deletionDays} days, except where the law requires us to keep it.
				</p>
			</section>

			<section aria-labelledby="liability">
				<h2 id="liability">Limitation of liability</h2>
				<p>
					To the maximum extent permitted by law, we are not liable for indirect, incidental,
					or consequential damages, or for lost profits or data. Our total liability for any
					claim related to the Service is limited to the amounts you paid us in the {LEGAL.liabilityMonths} months
					before the claim, or {LEGAL.liabilityAmount} if you paid nothing.
				</p>
			</section>

			<section aria-labelledby="law">
				<h2 id="law">Governing law</h2>
				<p>
					These Terms are governed by the laws of {LEGAL.jurisdiction}, and disputes are subject to
					the exclusive jurisdiction of the courts of {LEGAL.venue}, unless mandatory law provides
					otherwise.
				</p>
			</section>

			<section aria-labelledby="changes">
				<h2 id="changes">Changes and contact</h2>
				<p>
					We may update these Terms. We will post the new version here and, for material
					changes, notify account owners by email before they take effect. Contact:{" "}
					<strong>{LEGAL.companyName}</strong>, {LEGAL.postalAddress},{" "}
					<a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
				</p>
			</section>
		</LegalDocument>
	);
}
