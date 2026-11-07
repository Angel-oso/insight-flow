import { button, escapeHtml, layout, type EmailContent } from "./templates";

/**
 * Project invitation sent by email. The link is the single-use secret, so
 * the copy never says whether the address already has an account. The
 * subject is fixed: inviter and project names are user-supplied, so they
 * appear only in the (escaped) body, never in the subject line.
 */
export const INVITATION_SUBJECT = "You've been invited to a project on InsightFlow";

/**
 * Names are free text, so someone could name a project "Verify your account
 * at evil.example" and have us mail it. Names that contain anything a mail
 * client might turn into a link (schemes, "www", addresses, domain-like
 * "word.tld" runs, including fullwidth/ideographic dots after NFKC) are
 * left out of the email; the caller substitutes a generic label.
 */
export function emailSafeName(raw: string | undefined | null): string | null {
	const name = (raw ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
	if (!name) return null;
	if (/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/.test(name)) return null;
	if (/[a-z][a-z0-9+.-]*:\/\/|\bwww\b|@|\b(?:https?|mailto|ftp|data|javascript)\s*:/i.test(name)) return null;
	// "example.com", "foo\uff0ebar": a letter or digit, a dot (any script), then letters.
	if (/[\p{L}\p{N}-][.\u3002\uff0e\uff61]\p{L}{2,}/u.test(name)) return null;
	return name;
}

export function projectInvitationEmail({
	projectName,
	organizationName,
	inviterName,
	role,
	inviteUrl,
	expires,
}: {
	projectName: string;
	organizationName: string;
	inviterName: string;
	role: string;
	inviteUrl: string;
	expires: Date;
}): EmailContent {
	const hours = Math.max(1, Math.round((expires.getTime() - Date.now()) / 3_600_000));
	const validity = hours === 1 ? "1 hour" : `${hours} hours`;
	const inviter = emailSafeName(inviterName) ?? "A teammate";
	const project = emailSafeName(projectName);
	const organization = emailSafeName(organizationName);
	const safeRole = emailSafeName(role) ?? "a member";
	const target = project
		? organization && organization !== project
			? `${project} (${organization})`
			: project
		: organization
			? `a project in ${organization}`
			: "a project";
	const intro = `${inviter} invited you to join ${target} on InsightFlow as ${safeRole}.`;
	const footer =
		"You received this email because a project administrator entered this address. If you weren't expecting it, you can ignore it: nothing happens unless the link is opened and accepted.";
	return {
		subject: INVITATION_SUBJECT,
		html: layout({
			preheader: intro,
			body: `<p style="margin:0 0 12px;">${escapeHtml(intro)}</p>
<p style="margin:0;">Sign in or create an account with any email address, then accept the invitation. The link works once and expires in ${escapeHtml(validity)}.</p>
${button(inviteUrl, "Accept invitation")}
<p style="margin:0;font-size:13px;color:#52525b;word-break:break-all;">Or paste this link into your browser: ${escapeHtml(inviteUrl)}</p>`,
			footer: escapeHtml(footer),
		}),
		text: `${intro}\n\nSign in or create an account, then accept the invitation. The link works once and expires in ${validity}.\n\n${inviteUrl}\n\n--\n${footer}\n`,
	};
}
