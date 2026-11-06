import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { resendClient } from "../email/send";
import { escapeHtml } from "../email/templates";
import { isWellFormedToken, type NotificationKind } from "./preferences";

/**
 * POST /resend-webhook. Resend delivery events, verified by the component
 * with RESEND_WEBHOOK_SECRET (svix signature). Without the secret the
 * route refuses every request instead of trusting unsigned payloads.
 */
export const resendWebhook = httpAction(async (ctx, req) => {
	if (!process.env.RESEND_WEBHOOK_SECRET?.trim()) {
		console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set; event rejected.");
		return new Response("Webhook not configured", { status: 503 });
	}
	try {
		return await resendClient().handleResendEventWebhook(ctx, req);
	} catch (error) {
		console.warn("[resend-webhook] Rejected event:", error instanceof Error ? error.message : error);
		return new Response("Invalid webhook", { status: 400 });
	}
});

const LIST_LABELS: Record<NotificationKind, string> = {
	critical: "critical alerts",
	digest: "the weekly digest",
};

function page(status: number, title: string, body: string) {
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · InsightFlow</title>
<style>
body{margin:0;background:#f4f4f5;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:440px;margin:64px auto;padding:28px;background:#fff;border:1px solid #e4e4e7;border-radius:12px}
h1{font-size:18px;margin:0 0 12px}p{font-size:15px;line-height:24px;margin:0 0 16px;color:#3f3f46}
button{background:#18181b;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;font-weight:600;cursor:pointer}
</style>
</head>
<body><main><h1>${escapeHtml(title)}</h1>${body}</main></body>
</html>`;
	return new Response(html, {
		status,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
			"Referrer-Policy": "no-referrer",
			"X-Robots-Tag": "noindex",
			"X-Frame-Options": "DENY",
			"Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
		},
	});
}

const invalidLink = () =>
	page(
		400,
		"This link isn't valid",
		"<p>The unsubscribe link is incomplete or no longer valid. You can manage notifications from your project settings in InsightFlow.</p>",
	);

function parseTarget(params: URLSearchParams) {
	const token = params.get("token") ?? "";
	const list = params.get("list");
	if (!isWellFormedToken(token) || (list !== "critical" && list !== "digest")) return null;
	return { token, list: list as NotificationKind };
}

/**
 * GET /notifications/unsubscribe. Read-only confirmation page: link
 * scanners and previews follow GET links, so only the POST changes state.
 */
export const unsubscribePage = httpAction(async (ctx, req) => {
	const url = new URL(req.url);
	const target = parseTarget(url.searchParams);
	if (!target) return invalidLink();
	const info = await ctx.runQuery(internal.notifications.preferences.unsubscribeInfo, target);
	if (!info) return invalidLink();
	const label = LIST_LABELS[target.list];
	if (!info.subscribed) {
		return page(200, "You're unsubscribed", `<p>You no longer receive ${escapeHtml(label)} for <strong>${escapeHtml(info.projectName)}</strong>.</p>`);
	}
	const action = `${url.pathname}?token=${target.token}&list=${target.list}`;
	return page(
		200,
		`Unsubscribe from ${label}?`,
		`<p>You'll stop receiving ${escapeHtml(label)} for <strong>${escapeHtml(info.projectName)}</strong>. You can turn them back on in project settings.</p>
<form method="post" action="${escapeHtml(action)}"><button type="submit">Unsubscribe</button></form>`,
	);
});

/**
 * POST /notifications/unsubscribe. RFC 8058 one-click target (mail clients
 * POST "List-Unsubscribe=One-Click" to the header URL) and the confirmation
 * form. The token travels in the query string; a form body is a fallback.
 */
export const unsubscribePost = httpAction(async (ctx, req) => {
	const url = new URL(req.url);
	let target = parseTarget(url.searchParams);
	if (!target) {
		const body = (await req.text()).slice(0, 2000);
		target = parseTarget(new URLSearchParams(body));
	}
	if (!target) return invalidLink();
	const result = await ctx.runMutation(internal.notifications.preferences.unsubscribe, target);
	if (!result) return invalidLink();
	return page(
		200,
		"You're unsubscribed",
		`<p>You no longer receive ${escapeHtml(LIST_LABELS[target.list])} for <strong>${escapeHtml(result.projectName)}</strong>. You can turn them back on in project settings.</p>`,
	);
});
