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
import type * as auth from "../auth.js";
import type * as dashboard_overview from "../dashboard/overview.js";
import type * as feedback_access from "../feedback/access.js";
import type * as feedback_create from "../feedback/create.js";
import type * as feedback_mutations from "../feedback/mutations.js";
import type * as feedback_queries from "../feedback/queries.js";
import type * as http from "../http.js";
import type * as intake_public from "../intake/public.js";
import type * as invitations_actions from "../invitations/actions.js";
import type * as invitations_mutations from "../invitations/mutations.js";
import type * as invitations_queries from "../invitations/queries.js";
import type * as projects_mutations from "../projects/mutations.js";
import type * as projects_queries from "../projects/queries.js";
import type * as projects_settings from "../projects/settings.js";
import type * as setup_admin from "../setup/admin.js";
import type * as setup_mutations from "../setup/mutations.js";
import type * as setup_queries from "../setup/queries.js";
import type * as taxonomies_lib from "../taxonomies/lib.js";
import type * as taxonomies_mutations from "../taxonomies/mutations.js";
import type * as taxonomies_queries from "../taxonomies/queries.js";
import type * as team_mutations from "../team/mutations.js";
import type * as team_queries from "../team/queries.js";
import type * as users_account from "../users/account.js";
import type * as users_queries from "../users/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "access/roles": typeof access_roles;
  auth: typeof auth;
  "dashboard/overview": typeof dashboard_overview;
  "feedback/access": typeof feedback_access;
  "feedback/create": typeof feedback_create;
  "feedback/mutations": typeof feedback_mutations;
  "feedback/queries": typeof feedback_queries;
  http: typeof http;
  "intake/public": typeof intake_public;
  "invitations/actions": typeof invitations_actions;
  "invitations/mutations": typeof invitations_mutations;
  "invitations/queries": typeof invitations_queries;
  "projects/mutations": typeof projects_mutations;
  "projects/queries": typeof projects_queries;
  "projects/settings": typeof projects_settings;
  "setup/admin": typeof setup_admin;
  "setup/mutations": typeof setup_mutations;
  "setup/queries": typeof setup_queries;
  "taxonomies/lib": typeof taxonomies_lib;
  "taxonomies/mutations": typeof taxonomies_mutations;
  "taxonomies/queries": typeof taxonomies_queries;
  "team/mutations": typeof team_mutations;
  "team/queries": typeof team_queries;
  "users/account": typeof users_account;
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

export declare const components: {};
