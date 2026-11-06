/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access_roles from "../access/roles.js";
import type * as attachments_cleanup from "../attachments/cleanup.js";
import type * as attachments_files from "../attachments/files.js";
import type * as attachments_http from "../attachments/http.js";
import type * as attachments_model from "../attachments/model.js";
import type * as attachments_verify from "../attachments/verify.js";
import type * as audit_log from "../audit/log.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as dashboard_health from "../dashboard/health.js";
import type * as dashboard_overview from "../dashboard/overview.js";
import type * as email_authGuards from "../email/authGuards.js";
import type * as email_config from "../email/config.js";
import type * as email_invitationTemplate from "../email/invitationTemplate.js";
import type * as email_send from "../email/send.js";
import type * as email_templates from "../email/templates.js";
import type * as feedback_access from "../feedback/access.js";
import type * as feedback_aggregates from "../feedback/aggregates.js";
import type * as feedback_create from "../feedback/create.js";
import type * as feedback_deletion from "../feedback/deletion.js";
import type * as feedback_export from "../feedback/export.js";
import type * as feedback_mutations from "../feedback/mutations.js";
import type * as feedback_privacy from "../feedback/privacy.js";
import type * as feedback_queries from "../feedback/queries.js";
import type * as feedback_store from "../feedback/store.js";
import type * as http from "../http.js";
import type * as intake_captcha from "../intake/captcha.js";
import type * as intake_public from "../intake/public.js";
import type * as integrations_delivery from "../integrations/delivery.js";
import type * as integrations_signature from "../integrations/signature.js";
import type * as integrations_url from "../integrations/url.js";
import type * as integrations_webhooks from "../integrations/webhooks.js";
import type * as invitations_actions from "../invitations/actions.js";
import type * as invitations_caps from "../invitations/caps.js";
import type * as invitations_mutations from "../invitations/mutations.js";
import type * as invitations_queries from "../invitations/queries.js";
import type * as lib_slugs from "../lib/slugs.js";
import type * as monitoring_alerts from "../monitoring/alerts.js";
import type * as monitoring_detect from "../monitoring/detect.js";
import type * as notifications_critical from "../notifications/critical.js";
import type * as notifications_digest from "../notifications/digest.js";
import type * as notifications_preferences from "../notifications/preferences.js";
import type * as notifications_recipients from "../notifications/recipients.js";
import type * as notifications_retention from "../notifications/retention.js";
import type * as notifications_suppression from "../notifications/suppression.js";
import type * as notifications_webhooks from "../notifications/webhooks.js";
import type * as organizations_access from "../organizations/access.js";
import type * as organizations_deletion from "../organizations/deletion.js";
import type * as organizations_members from "../organizations/members.js";
import type * as organizations_mutations from "../organizations/mutations.js";
import type * as organizations_queries from "../organizations/queries.js";
import type * as projects_deletion from "../projects/deletion.js";
import type * as projects_mutations from "../projects/mutations.js";
import type * as projects_queries from "../projects/queries.js";
import type * as projects_settings from "../projects/settings.js";
import type * as rateLimits from "../rateLimits.js";
import type * as setup_admin from "../setup/admin.js";
import type * as setup_mutations from "../setup/mutations.js";
import type * as setup_queries from "../setup/queries.js";
import type * as taxonomies_completion from "../taxonomies/completion.js";
import type * as taxonomies_lib from "../taxonomies/lib.js";
import type * as taxonomies_limits from "../taxonomies/limits.js";
import type * as taxonomies_mutations from "../taxonomies/mutations.js";
import type * as taxonomies_queries from "../taxonomies/queries.js";
import type * as team_admins from "../team/admins.js";
import type * as team_mutations from "../team/mutations.js";
import type * as team_queries from "../team/queries.js";
import type * as users_account from "../users/account.js";
import type * as users_deletion from "../users/deletion.js";
import type * as users_export from "../users/export.js";
import type * as users_queries from "../users/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "access/roles": typeof access_roles;
  "attachments/cleanup": typeof attachments_cleanup;
  "attachments/files": typeof attachments_files;
  "attachments/http": typeof attachments_http;
  "attachments/model": typeof attachments_model;
  "attachments/verify": typeof attachments_verify;
  "audit/log": typeof audit_log;
  auth: typeof auth;
  crons: typeof crons;
  "dashboard/health": typeof dashboard_health;
  "dashboard/overview": typeof dashboard_overview;
  "email/authGuards": typeof email_authGuards;
  "email/config": typeof email_config;
  "email/invitationTemplate": typeof email_invitationTemplate;
  "email/send": typeof email_send;
  "email/templates": typeof email_templates;
  "feedback/access": typeof feedback_access;
  "feedback/aggregates": typeof feedback_aggregates;
  "feedback/create": typeof feedback_create;
  "feedback/deletion": typeof feedback_deletion;
  "feedback/export": typeof feedback_export;
  "feedback/mutations": typeof feedback_mutations;
  "feedback/privacy": typeof feedback_privacy;
  "feedback/queries": typeof feedback_queries;
  "feedback/store": typeof feedback_store;
  http: typeof http;
  "intake/captcha": typeof intake_captcha;
  "intake/public": typeof intake_public;
  "integrations/delivery": typeof integrations_delivery;
  "integrations/signature": typeof integrations_signature;
  "integrations/url": typeof integrations_url;
  "integrations/webhooks": typeof integrations_webhooks;
  "invitations/actions": typeof invitations_actions;
  "invitations/caps": typeof invitations_caps;
  "invitations/mutations": typeof invitations_mutations;
  "invitations/queries": typeof invitations_queries;
  "lib/slugs": typeof lib_slugs;
  "monitoring/alerts": typeof monitoring_alerts;
  "monitoring/detect": typeof monitoring_detect;
  "notifications/critical": typeof notifications_critical;
  "notifications/digest": typeof notifications_digest;
  "notifications/preferences": typeof notifications_preferences;
  "notifications/recipients": typeof notifications_recipients;
  "notifications/retention": typeof notifications_retention;
  "notifications/suppression": typeof notifications_suppression;
  "notifications/webhooks": typeof notifications_webhooks;
  "organizations/access": typeof organizations_access;
  "organizations/deletion": typeof organizations_deletion;
  "organizations/members": typeof organizations_members;
  "organizations/mutations": typeof organizations_mutations;
  "organizations/queries": typeof organizations_queries;
  "projects/deletion": typeof projects_deletion;
  "projects/mutations": typeof projects_mutations;
  "projects/queries": typeof projects_queries;
  "projects/settings": typeof projects_settings;
  rateLimits: typeof rateLimits;
  "setup/admin": typeof setup_admin;
  "setup/mutations": typeof setup_mutations;
  "setup/queries": typeof setup_queries;
  "taxonomies/completion": typeof taxonomies_completion;
  "taxonomies/lib": typeof taxonomies_lib;
  "taxonomies/limits": typeof taxonomies_limits;
  "taxonomies/mutations": typeof taxonomies_mutations;
  "taxonomies/queries": typeof taxonomies_queries;
  "team/admins": typeof team_admins;
  "team/mutations": typeof team_mutations;
  "team/queries": typeof team_queries;
  "users/account": typeof users_account;
  "users/deletion": typeof users_deletion;
  "users/export": typeof users_export;
  "users/queries": typeof users_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  feedbackByReceived: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"feedbackByReceived">;
  feedbackByCompleted: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"feedbackByCompleted">;
  feedbackByStatus: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"feedbackByStatus">;
  feedbackByCategory: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"feedbackByCategory">;
  feedbackByAssignee: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"feedbackByAssignee">;
  feedbackByAssigneeCompleted: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"feedbackByAssigneeCompleted">;
};
