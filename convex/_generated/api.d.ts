/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as dashboard_overview from "../dashboard/overview.js";
import type * as feedback_access from "../feedback/access.js";
import type * as feedback_mutations from "../feedback/mutations.js";
import type * as feedback_queries from "../feedback/queries.js";
import type * as http from "../http.js";
import type * as projects_settings from "../projects/settings.js";
import type * as setup_mutations from "../setup/mutations.js";
import type * as setup_queries from "../setup/queries.js";
import type * as setup_seed from "../setup/seed.js";
import type * as taxonomies_lib from "../taxonomies/lib.js";
import type * as taxonomies_mutations from "../taxonomies/mutations.js";
import type * as taxonomies_queries from "../taxonomies/queries.js";
import type * as team_queries from "../team/queries.js";
import type * as users_queries from "../users/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "dashboard/overview": typeof dashboard_overview;
  "feedback/access": typeof feedback_access;
  "feedback/mutations": typeof feedback_mutations;
  "feedback/queries": typeof feedback_queries;
  http: typeof http;
  "projects/settings": typeof projects_settings;
  "setup/mutations": typeof setup_mutations;
  "setup/queries": typeof setup_queries;
  "setup/seed": typeof setup_seed;
  "taxonomies/lib": typeof taxonomies_lib;
  "taxonomies/mutations": typeof taxonomies_mutations;
  "taxonomies/queries": typeof taxonomies_queries;
  "team/queries": typeof team_queries;
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
