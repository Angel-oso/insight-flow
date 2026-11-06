/**
 * Transactional email templates: small, inline-styled HTML plus a plain-text
 * twin. Every value interpolated into HTML goes through `escapeHtml`.
 */
export type EmailContent = { subject: string; html: string; text: string };

export function escapeHtml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

const font =
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function layout({
	preheader,
	body,
	footer,
}: {
	preheader: string;
	body: string;
	footer: string;
}) {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>InsightFlow</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${font};color:#18181b;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
<tr><td style="padding:28px 28px 8px;font-size:15px;font-weight:600;letter-spacing:-0.01em;">InsightFlow</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:24px;">${body}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e4e4e7;font-size:12px;line-height:18px;color:#52525b;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function button(href: string, label: string) {
	return `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px;">${escapeHtml(label)}</a></p>`;
}

function codeBlock(code: string) {
	return `<p style="margin:20px 0;font-size:28px;font-weight:700;letter-spacing:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${escapeHtml(code)}</p>`;
}

function minutes(expires: Date) {
	return Math.max(1, Math.round((expires.getTime() - Date.now()) / 60000));
}

const authFooterText =
	"You received this email because someone used this address on InsightFlow. If it wasn't you, you can ignore it — nothing changes until the code is entered.";

/** Codes for sign-up verification, password reset and email change. */
export function authCodeEmail({
	purpose,
	code,
	expires,
}: {
	purpose: "verify" | "reset" | "email-change";
	code: string;
	expires: Date;
}): EmailContent {
	const copy = {
		verify: {
			subject: `${code} is your InsightFlow verification code`,
			intro: "Enter this code to verify your email address and finish signing in.",
		},
		reset: {
			subject: `${code} is your InsightFlow password reset code`,
			intro: "Enter this code to choose a new password for your account.",
		},
		"email-change": {
			subject: `${code} is your code to confirm your new email`,
			intro: "Enter this code in your InsightFlow account settings to make this your sign-in email.",
		},
	}[purpose];
	const validFor = `The code expires in ${minutes(expires)} minutes.`;
	return {
		subject: copy.subject,
		html: layout({
			preheader: copy.intro,
			body: `<p style="margin:0;">${escapeHtml(copy.intro)}</p>${codeBlock(code)}<p style="margin:0;color:#52525b;">${escapeHtml(validFor)} Never share it with anyone.</p>`,
			footer: escapeHtml(authFooterText),
		}),
		text: `${copy.intro}\n\n${code}\n\n${validFor} Never share it with anyone.\n\n--\n${authFooterText}\n`,
	};
}

/** Security notice to the previous address after an email change. */
export function emailChangedNotice({
	newEmail,
	supportUrl,
}: {
	newEmail: string;
	supportUrl: string;
}): EmailContent {
	const intro = `The sign-in email for your InsightFlow account was changed to ${newEmail}.`;
	const followUp =
		"If you made this change, no action is needed. If you didn't, reset your password from the sign-in page right away.";
	return {
		subject: "Your InsightFlow sign-in email was changed",
		html: layout({
			preheader: intro,
			body: `<p style="margin:0 0 12px;">${escapeHtml(intro)}</p><p style="margin:0;">${escapeHtml(followUp)}</p>${button(supportUrl, "Go to sign in")}`,
			footer: escapeHtml(
				"This security notice is sent to your previous address whenever your sign-in email changes.",
			),
		}),
		text: `${intro}\n\n${followUp}\n${supportUrl}\n\n--\nThis security notice is sent to your previous address whenever your sign-in email changes.\n`,
	};
}

function notificationFooter(
	kind: "critical" | "digest",
	projectName: string,
	settingsUrl: string,
	unsubscribeUrl: string,
) {
	const setting = kind === "critical" ? "critical alerts" : "the weekly digest";
	const text = `You're receiving this because you can triage feedback in ${projectName} and ${setting} is turned on for that project. Unsubscribe from ${setting} for this project: ${unsubscribeUrl}\nManage your notifications (project admins can turn it off in project settings): ${settingsUrl}`;
	const html = `You're receiving this because you can triage feedback in <strong>${escapeHtml(projectName)}</strong> and ${setting} is turned on for that project. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#52525b;">Unsubscribe from ${setting}</a> for this project or manage your notifications in <a href="${escapeHtml(settingsUrl)}" style="color:#52525b;">project settings</a>.`;
	return { text, html };
}

export function criticalAlertEmail({
	projectName,
	title,
	description,
	category,
	priority,
	senderName,
	feedbackUrl,
	settingsUrl,
	unsubscribeUrl,
}: {
	projectName: string;
	title: string;
	description: string;
	category: string;
	priority: string;
	senderName: string | null;
	feedbackUrl: string;
	settingsUrl: string;
	unsubscribeUrl: string;
}): EmailContent {
	const excerpt = description.length > 400 ? `${description.slice(0, 397)}…` : description;
	const meta = `${priority} · ${category}${senderName ? ` · from ${senderName}` : ""}`;
	const footer = notificationFooter("critical", projectName, settingsUrl, unsubscribeUrl);
	return {
		subject: `[${projectName}] ${priority}: ${title}`,
		html: layout({
			preheader: `${priority} feedback in ${projectName}: ${title}`,
			body: `<p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#b91c1c;">${escapeHtml(priority)} feedback</p>
<p style="margin:0 0 4px;font-size:18px;font-weight:600;line-height:26px;">${escapeHtml(title)}</p>
<p style="margin:0 0 16px;font-size:13px;color:#52525b;">${escapeHtml(meta)}</p>
<p style="margin:0;white-space:pre-line;">${escapeHtml(excerpt)}</p>
${button(feedbackUrl, "Open in InsightFlow")}`,
			footer: footer.html,
		}),
		text: `${priority} feedback in ${projectName}\n\n${title}\n${meta}\n\n${excerpt}\n\nOpen in InsightFlow: ${feedbackUrl}\n\n--\n${footer.text}\n`,
	};
}

/**
 * One email standing in for a burst of critical alerts that went over the
 * per-project limit (convex/notifications/critical.ts).
 */
export function criticalSummaryEmail({
	projectName,
	priority,
	items,
	more,
	feedbackUrl,
	settingsUrl,
	unsubscribeUrl,
}: {
	projectName: string;
	priority: string;
	items: { title: string; url: string }[];
	/** Items beyond those listed. */
	more: number;
	feedbackUrl: string;
	settingsUrl: string;
	unsubscribeUrl: string;
}): EmailContent {
	const total = items.length + more;
	const headline = `${total} more ${priority} ${total === 1 ? "item" : "items"} arrived in ${projectName}`;
	const footer = notificationFooter("critical", projectName, settingsUrl, unsubscribeUrl);
	const moreLine = more > 0 ? `…and ${more} more.` : "";
	return {
		subject: `[${projectName}] ${total} more ${priority} ${total === 1 ? "item" : "items"}`,
		html: layout({
			preheader: headline,
			body: `<p style="margin:0 0 12px;">${escapeHtml(headline)}. We grouped them into one email to keep your inbox quiet.</p>
<ul style="margin:0;padding-left:20px;">${items
				.map(
					(item) =>
						`<li style="margin:0 0 8px;"><a href="${escapeHtml(item.url)}" style="color:#18181b;">${escapeHtml(item.title)}</a></li>`,
				)
				.join("")}</ul>${moreLine ? `<p style="margin:8px 0 0;color:#52525b;">${escapeHtml(moreLine)}</p>` : ""}
${button(feedbackUrl, "Open the feedback inbox")}`,
			footer: footer.html,
		}),
		text: `${headline}. We grouped them into one email to keep your inbox quiet.\n\n${items
			.map((item) => `- ${item.title}\n  ${item.url}`)
			.join("\n")}${moreLine ? `\n${moreLine}` : ""}\n\nOpen the feedback inbox: ${feedbackUrl}\n\n--\n${footer.text}\n`,
	};
}

export type DigestStats = {
	received: number;
	resolved: number;
	open: number;
	critical: number;
	/** True when a count hit the scan cap and is a lower bound. */
	capped: boolean;
};

export type DigestItem = {
	title: string;
	priority: string;
	status: string;
	url: string;
	ageDays: number;
};

export function weeklyDigestEmail({
	projectName,
	stats,
	items,
	feedbackUrl,
	settingsUrl,
	unsubscribeUrl,
}: {
	projectName: string;
	stats: DigestStats;
	items: DigestItem[];
	feedbackUrl: string;
	settingsUrl: string;
	unsubscribeUrl: string;
}): EmailContent {
	const plus = stats.capped ? "+" : "";
	const rows: [string, number][] = [
		["Received", stats.received],
		["Resolved", stats.resolved],
		["Open now", stats.open],
		["Critical received", stats.critical],
	];
	const footer = notificationFooter("digest", projectName, settingsUrl, unsubscribeUrl);
	const statCells = rows
		.map(
			([label, value]) =>
				`<td style="padding:12px;border:1px solid #e4e4e7;border-radius:8px;text-align:left;width:25%;"><div style="font-size:20px;font-weight:700;">${value}${plus}</div><div style="font-size:12px;color:#52525b;">${escapeHtml(label)}</div></td>`,
		)
		.join("");
	const itemList = items.length
		? `<p style="margin:24px 0 8px;font-weight:600;">Needs attention</p><ul style="margin:0;padding-left:20px;">${items
				.map(
					(item) =>
						`<li style="margin:0 0 8px;"><a href="${escapeHtml(item.url)}" style="color:#18181b;">${escapeHtml(item.title)}</a><br><span style="font-size:13px;color:#52525b;">${escapeHtml(`${item.priority} · ${item.status} · open ${item.ageDays} ${item.ageDays === 1 ? "day" : "days"}`)}</span></li>`,
				)
				.join("")}</ul>`
		: `<p style="margin:24px 0 0;color:#52525b;">Nothing urgent is waiting. Nice work.</p>`;
	const textItems = items.length
		? `\nNeeds attention:\n${items
				.map((item) => `- ${item.title} (${item.priority}, ${item.status}, open ${item.ageDays}d)\n  ${item.url}`)
				.join("\n")}\n`
		: "\nNothing urgent is waiting.\n";
	return {
		subject: `[${projectName}] Your weekly feedback digest`,
		html: layout({
			preheader: `${stats.received}${plus} received, ${stats.resolved}${plus} resolved, ${stats.open}${plus} open in ${projectName} this week.`,
			body: `<p style="margin:0 0 16px;">Here's what happened in <strong>${escapeHtml(projectName)}</strong> over the last 7 days.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="4"><tr>${statCells}</tr></table>
${itemList}
${button(feedbackUrl, "Open the feedback inbox")}`,
			footer: footer.html,
		}),
		text: `Weekly digest for ${projectName} (last 7 days)\n\n${rows
			.map(([label, value]) => `${label}: ${value}${plus}`)
			.join("\n")}\n${textItems}\nOpen the feedback inbox: ${feedbackUrl}\n\n--\n${footer.text}\n`,
	};
}
