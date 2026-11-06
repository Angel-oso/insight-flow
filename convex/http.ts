import { httpRouter } from "convex/server";
import { serveFile, uploadFile, uploadPreflight } from "./attachments/http";
import { auth } from "./auth";
import { resendWebhook, unsubscribePage, unsubscribePost } from "./notifications/webhooks";

const http = httpRouter();

auth.addHttpRoutes(http);

// Resend delivery events (bounces/complaints feed email suppression).
// Configure in the Resend dashboard; secret in RESEND_WEBHOOK_SECRET.
http.route({ path: "/resend-webhook", method: "POST", handler: resendWebhook });
// One-click unsubscribe from notification emails (RFC 8058). GET only
// renders a confirmation page; POST unsubscribes.
http.route({ path: "/notifications/unsubscribe", method: "GET", handler: unsubscribePage });
http.route({ path: "/notifications/unsubscribe", method: "POST", handler: unsubscribePost });
// [area:notifications] routes
// Attachment downloads through short-lived signed links (attachments/http.ts).
http.route({ path: "/attachments/file", method: "GET", handler: serveFile });
// Attachment uploads with a single-use ticket; size enforced before storing.
http.route({ path: "/attachments/upload", method: "POST", handler: uploadFile });
http.route({ path: "/attachments/upload", method: "OPTIONS", handler: uploadPreflight });
// [area:attachments-integrations] routes

export default http;
