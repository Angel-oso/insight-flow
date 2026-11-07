import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { LEGAL } from "@/lib/legal";

/*
 * Company-specific values live in lib/legal.ts (run `pnpm check:legal`).
 * Have the final text reviewed by counsel before launch.
 */

export const metadata: Metadata = {
	title: "Privacy Policy — InsightFlow",
	description: "How InsightFlow collects, uses, and protects personal data.",
};

export default function PrivacyPage() {
	return (
		<LegalDocument title="Privacy Policy" updated={LEGAL.effectiveDate}>
			<section>
				<p>
					This Privacy Policy explains how <strong>{LEGAL.companyName}</strong> (&ldquo;we&rdquo;,
					&ldquo;us&rdquo;) collects and uses personal data when you use InsightFlow (the
					&ldquo;Service&rdquo;), a tool that lets organizations collect and manage product
					feedback. Questions can be sent to <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
				</p>
			</section>

			<section aria-labelledby="roles">
				<h2 id="roles">Our role</h2>
				<p>
					For the account data of people who sign up and use a workspace, we act as the
					controller. For feedback that an organization collects through its public feedback
					links, the organization using InsightFlow is the controller and we process that data
					on its behalf as a processor. If you submitted feedback to an organization, contact
					that organization first about your data; we will help them respond.
				</p>
			</section>

			<section aria-labelledby="collected">
				<h2 id="collected">Data we collect</h2>
				<ul>
					<li>
						<strong>Account data:</strong> your name, email address, and a hashed password, or
						the name, email address, and profile picture provided by Google when you sign in
						with Google.
					</li>
					<li>
						<strong>Workspace data:</strong> organizations, projects, roles, invitations,
						feedback triage (status, priority, category, assignee), internal notes, and the
						activity history of these changes.
					</li>
					<li>
						<strong>Feedback submitted through public links:</strong> the title, description,
						and category of the feedback, plus an optional name and email address if the person
						submitting chooses to provide them.
					</li>
					<li>
						<strong>Technical data:</strong> limited request metadata needed to operate and
						protect the Service, such as abuse-prevention signals and error reports. We do not
						use advertising cookies or third-party analytics trackers.
					</li>
				</ul>
				<p>
					Your sign-in session is stored in your browser&rsquo;s local storage so you stay
					signed in. It is not used for tracking.
				</p>
			</section>

			<section aria-labelledby="use">
				<h2 id="use">How we use data</h2>
				<ul>
					<li>To provide the Service: authenticate you, show your workspace, and deliver feedback to the right project.</li>
					<li>To send transactional email, such as invitations and account messages.</li>
					<li>To keep the Service secure: prevent spam and abuse, and diagnose errors.</li>
					<li>To comply with legal obligations.</li>
				</ul>
				<p>
					Our legal bases are the performance of our contract with you or your organization,
					our legitimate interest in securing and improving the Service, and compliance with
					law. We do not sell personal data.
				</p>
			</section>

			<section aria-labelledby="processors">
				<h2 id="processors">Service providers</h2>
				<p>We share data only with providers that help us run the Service:</p>
				<ul>
					<li><strong>Convex</strong>: backend hosting and database.</li>
					<li><strong>{LEGAL.webHost}</strong>: hosting of the web application.</li>
					<li><strong>Brevo</strong>: delivery of transactional email.</li>
					<li><strong>Google</strong>: sign-in, when you choose &ldquo;Continue with Google&rdquo;.</li>
					<li><strong>Cloudflare Turnstile</strong>: bot protection on public feedback forms and sign-in pages.</li>
					<li><strong>Sentry</strong>: error monitoring, configured not to collect IP addresses or cookies.</li>
				</ul>
				<p>
					When an organization connects a webhook (for example to Slack), new feedback titles
					and details are sent to the destination it chooses; submitter names and emails are
					never included.
				</p>
				<p>
					Some providers process data outside your country, including in the United States.
					Where required, transfers rely on appropriate safeguards such as Standard Contractual
					Clauses. {LEGAL.dataRegions}
				</p>
			</section>

			<section aria-labelledby="retention">
				<h2 id="retention">Retention and deletion</h2>
				<p>
					We keep account and workspace data while the account or organization is active.
					Feedback is kept until the organization that collected it deletes it: project
					administrators can delete individual feedback items, organization administrators
					can delete a project, and the organization owner can delete the whole organization.
					Deleted data disappears from the product immediately. Deleted projects and
					organizations can be restored by their administrators for 7 days and are then
					removed from the live database; other deletions are removed shortly after. Copies
					of notification emails are kept for 7 days for delivery tracking. Unused invitation links are deleted 30 days after they
					expire. You can delete your account yourself from your account settings; this
					removes your profile, sign-in data, sessions and workspace memberships right away.
					Internal notes you wrote stay in the workspace&apos;s history, shown as &quot;Former
					member&quot;; ask the organization or us if you want them removed. If you cannot use
					the self-serve option, ask us and we delete or anonymize your personal data within
					{LEGAL.deletionDays} days, except where we must keep it to meet legal obligations. Backups are
					overwritten on a rolling basis within {LEGAL.backupRetention}. Error reports are
					kept by Sentry for up to {LEGAL.errorReportDays} days.
				</p>
			</section>

			<section aria-labelledby="rights">
				<h2 id="rights">Your rights</h2>
				<p>
					Depending on where you live, you may have the right to access, correct, delete, or
					export your personal data, and to object to or restrict certain processing. You can
					download a copy of your account data from the account menu. Project administrators can export their
					project&apos;s feedback and erase a submitter&apos;s name and email. To exercise other rights, email <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
					You can also lodge a complaint with your local data protection authority.
				</p>
			</section>

			<section aria-labelledby="security">
				<h2 id="security">Security</h2>
				<p>
					Data is encrypted in transit, passwords are hashed, and access inside a workspace is
					limited by role. No system is perfectly secure; if we become aware of a breach that
					affects your data, we will notify you as required by law.
				</p>
			</section>

			<section aria-labelledby="children">
				<h2 id="children">Children</h2>
				<p>The Service is intended for businesses and is not directed at children under 16.</p>
			</section>

			<section aria-labelledby="changes">
				<h2 id="changes">Changes and contact</h2>
				<p>
					We will post changes to this policy on this page and update the date above. For
					material changes we will notify account owners by email. Contact:{" "}
					<strong>{LEGAL.companyName}</strong>, {LEGAL.postalAddress},{" "}
					<a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
				</p>
			</section>
		</LegalDocument>
	);
}
