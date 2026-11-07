# Deploying InsightFlow

Production runbook: first deploy, configuration, data steps, backups,
monitoring, security, and rollback.

> Commands marked `--prod` act on the **production** Convex deployment. Read
> them twice before running them.

---

## 1. Architecture

```text
Browser ──HTTPS──▶ Next.js app (Vercel, or any Node host)
   │                 • App Router pages, rendered per request (nonce CSP)
   │                 • proxy.ts sets the Content-Security-Policy
   │                 • /monitoring tunnels browser errors to Sentry
   │
   ├──WSS/HTTPS──▶ Convex production deployment  https://<name>.convex.cloud
   │                 • database, queries, mutations, actions, scheduler
   │                 • Convex Auth (password + Google), rate limits, Turnstile check
   │                 • Brevo API (transactional email)
   │
   └──HTTPS──────▶ Convex HTTP actions             https://<name>.convex.site
                     • /api/auth/* (OAuth sign-in and callback, JWKS)
```

- The Next.js app holds **no secrets at runtime** apart from Sentry build
  settings. All server secrets live in the Convex deployment environment.
- The session token is stored in the browser's `localStorage` by
  `ConvexAuthProvider`. The strict CSP (section 8) is the main XSS mitigation.
- One Convex project has a **dev** deployment (each developer's
  `npx convex dev`) and one **prod** deployment. Preview deployments are
  optional.

---

## 2. First deploy

### 2.1 Convex production deployment

1. In the [Convex dashboard](https://dashboard.convex.dev), open the project
   and select the **Production** deployment.
2. *Settings → URL & Deploy Key* → **Generate production deploy key**. Keep it
   secret; it can push code to production.
3. Set the production environment variables (section 3.1) **before** the first
   deploy, either in *Settings → Environment Variables* or with the CLI:

   ```bash
   npx convex env set --prod SITE_URL https://app.example.com
   ```

4. Push the backend once from your machine to check that it deploys:

   ```bash
   CONVEX_DEPLOY_KEY='prod:...' npx convex deploy
   ```

   On PowerShell: `$env:CONVEX_DEPLOY_KEY='prod:...'; npx convex deploy`.

### 2.2 Vercel project

1. Import the Git repository in Vercel. Framework preset: **Next.js**.
   Install command: `pnpm install --frozen-lockfile` (pnpm 10.4.1 from
   `packageManager`).
2. **Build command**:

   ```bash
   npx convex deploy --cmd 'pnpm build'
   ```

   `convex deploy` pushes the backend, then runs `pnpm build` with
   `NEXT_PUBLIC_CONVEX_URL` set to the production deployment URL. Backend and
   frontend therefore always ship together, and the build fails if the backend
   push fails.
3. Set the hosting environment variables (section 3.2). `CONVEX_DEPLOY_KEY`
   must be scoped to **Production** only. For preview deployments use a
   separate *preview* deploy key, or leave previews off.
4. Deploy. Then add the custom domain and make sure `SITE_URL` (Convex) is
   exactly that origin, without a trailing slash.
5. If the Convex deployment itself uses a custom domain (so its
   `CONVEX_SITE_URL` is no longer `https://<deployment>.convex.site`), set
   `NEXT_PUBLIC_CONVEX_SITE_URL` in Vercel to that same origin and redeploy.
   Signed attachment links are minted on `CONVEX_SITE_URL`, OAuth redirects
   go through it, and the CSP (`proxy.ts`) only allows the origin in
   `NEXT_PUBLIC_CONVEX_SITE_URL`: a mismatch blocks attachment images and
   Google sign-in.

### 2.3 Google OAuth

1. Google Cloud Console → *APIs & Services → Credentials* → **OAuth client
   ID** (type *Web application*).
2. **Authorized redirect URI**:
   `https://<deployment>.convex.site/api/auth/callback/google`
   (the *HTTP Actions URL* of the production deployment, or your custom Convex
   domain if you configured one).
3. **Authorized JavaScript origin**: your app origin (`SITE_URL`).
4. Publish the OAuth consent screen (otherwise only test users can sign in)
   and link the Privacy Policy (`/privacy`) and Terms (`/terms`).
5. Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` on the Convex deployment.

### 2.4 Email (Brevo)

1. Create a free Brevo account. Free plan: 300 emails a day.
2. *Senders & IPs → Senders* → add the address emails come from (for example
   your Gmail) and confirm it from the link Brevo sends. No domain is needed;
   with a free mailbox some messages may land in spam. With your own domain,
   authenticate it in *Senders & IPs → Domains* (SPF/DKIM) for better
   delivery.
3. *SMTP & API → API Keys* → **Generate a new API key**.
4. Set `BREVO_API_KEY` and `EMAIL_FROM` (the verified sender, e.g.
   `InsightFlow <you@gmail.com>`) on the Convex deployment. Make sure
   `EMAIL_DEV_LOG` is **not** set in production. Without both values,
   password sign-up, email verification, password reset and email changes
   **fail** (the code cannot be sent and the user sees an error), and
   notifications are skipped with an error in the Convex log.
5. Sends run as background jobs after the triggering write commits and are
   retried on rate limits and server errors (up to 4 retries). A permanent
   failure shows up in the Convex logs and in ops alerts.
6. **Bounce/complaint webhook (optional).** Set `BREVO_WEBHOOK_SECRET` to a
   long random string on the Convex deployment. In Brevo → *Transactional →
   Settings → Webhook*, add
   `https://<deployment>.convex.site/brevo-webhook?token=<BREVO_WEBHOOK_SECRET>`
   with the *Hard bounce*, *Invalid email* and *Spam* events. Those addresses
   are then suppressed for notification emails (auth codes still go out).
   Without the secret the route rejects every call.

### 2.5 Cloudflare Turnstile

1. Cloudflare dashboard → *Turnstile* → **Add widget**. Hostname: your app
   domain. Mode: *Managed*.
2. Set the **site key** as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (hosting) and the
   **secret key** as `TURNSTILE_SECRET_KEY` (Convex). Redeploy the frontend so
   the site key is inlined.
3. The same keys protect the public intake form (`/f/<slug>`) **and** the auth
   flows that email a code (sign-up, resending a code, password reset, sign-in
   of an unverified account). Both fail closed: without `TURNSTILE_SECRET_KEY`
   those requests are rejected.

### 2.6 Sentry (optional, recommended)

1. Create a Sentry project (platform *Next.js*). Copy the DSN.
2. Set `NEXT_PUBLIC_SENTRY_DSN` in the hosting env. For readable stack traces
   also set `SENTRY_AUTH_TOKEN` (an *Organization token* with
   `project:releases` / source map upload scope), `SENTRY_ORG`, and
   `SENTRY_PROJECT`. Source maps are uploaded only when the token is present
   and are deleted from the build output after upload.
3. Without `NEXT_PUBLIC_SENTRY_DSN`, Sentry is a no-op and the build does not
   load the Sentry plugin.

---

## 3. Environment variables

### 3.1 Convex deployment environment

Set in the dashboard (*Settings → Environment Variables*) or with
`npx convex env set --prod NAME value`. Never commit them.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SITE_URL` | Yes | App origin, e.g. `https://app.example.com`. Post-login redirects and every link in emails. No trailing slash. |
| `JWT_PRIVATE_KEY` | Yes | RS256 private key that signs session JWTs. |
| `JWKS` | Yes | JSON Web Key Set with the public key matching `JWT_PRIVATE_KEY`. |
| `AUTH_GOOGLE_ID` | For Google sign-in | Google OAuth client ID. |
| `AUTH_GOOGLE_SECRET` | For Google sign-in | Google OAuth client secret. |
| `BREVO_API_KEY` | Yes | Brevo API key. Without it auth codes cannot be sent, so password sign-up, verification, password reset and email changes fail with an error; notifications are skipped and logged as an error in the Convex log. |
| `OPS_ALERT_EMAIL` | Recommended | Address that receives backend failure alerts (failed background jobs, unfinished purges), at most one email per function per hour. Without it the check only logs an error. |
| `BREVO_WEBHOOK_SECRET` | Optional | Shared secret of the Brevo webhook (`/brevo-webhook?token=...`). Without it bounces and complaints are not recorded. |
| `EMAIL_FROM` | Yes | Sender verified in Brevo, e.g. `InsightFlow <you@gmail.com>`. |
| `EMAIL_DEV_LOG` | **Must be unset** | `true` logs emails, including auth codes, to the Convex log instead of sending. Development only. |
| `TURNSTILE_SECRET_KEY` | Yes | Cloudflare Turnstile secret. Verifies public intake submissions and the auth flows that email a code (sign-up, resend, password reset). Without it those requests are rejected (fails closed). |
| `INTAKE_CAPTCHA_DISABLED` | **Must be unset** | Exactly `true` turns off the Turnstile check for public intake **and** auth email flows when `TURNSTILE_SECRET_KEY` is unset. Local development and tests only. |

`CONVEX_SITE_URL` and `CONVEX_CLOUD_URL` are provided by Convex automatically.

**Generating `JWT_PRIVATE_KEY` and `JWKS`.** Run this once per deployment
(Node 20+), in an empty folder outside the repo:

```js
// generateKeys.mjs
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const jwk = await exportJWK(keys.publicKey);
console.log(`JWT_PRIVATE_KEY="${privateKey.trimEnd().replace(/\n/g, " ")}"`);
console.log(`JWKS=${JSON.stringify({ keys: [{ use: "sig", ...jwk }] })}`);
```

Alternatively, `npx @convex-dev/auth --prod` generates and sets both
interactively. When setting them by hand:

```bash
npx convex env set --prod JWT_PRIVATE_KEY -- "-----BEGIN PRIVATE KEY----- ..."
# bash
npx convex env set --prod JWKS '{"keys":[...]}'
# PowerShell: shell quoting strips the JSON quotes, so use a file
npx convex env set --prod JWKS --from-file jwks.json
```

Delete the generated files afterwards. Rotating the pair signs every user out.

### 3.2 Hosting environment (Vercel)

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `CONVEX_DEPLOY_KEY` | Production, build | Yes | Lets `npx convex deploy` push the backend and inject the URL. Secret. |
| `NEXT_PUBLIC_CONVEX_URL` | Build | Set automatically | Injected by `npx convex deploy --cmd`. Set it manually only when building without that wrapper. Also used to build the CSP `connect-src`. |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Build | Set automatically | `https://<deployment>.convex.site`, injected by `npx convex deploy --cmd` alongside the URL. Allowed in the CSP for OAuth. When unset it is derived from `NEXT_PUBLIC_CONVEX_URL` (only for `*.convex.cloud` URLs). With a custom Convex domain it **must** equal the origin of the deployment's `CONVEX_SITE_URL`: attachment images and OAuth use that origin and the CSP is built from this variable. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Build | Yes | Turnstile site key for the intake form and the auth forms; the widget is not rendered without it (and, with the secret set, those submissions are then rejected). |
| `NEXT_PUBLIC_SENTRY_DSN` | Build + runtime | Optional | Enables Sentry in browser and server. |
| `SENTRY_AUTH_TOKEN` | Build | Optional | Source map upload. Secret. |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Build | With the token | Sentry organization and project slugs. |
| `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Runtime / build | Optional | Overrides the environment tag on the server / in the browser. Defaults to `VERCEL_ENV` (server) or `NEXT_PUBLIC_VERCEL_ENV` (browser, exposed by Vercel's system environment variables), then `NODE_ENV`. |

`NEXT_PUBLIC_*` values are inlined at build time: changing one requires a
redeploy.

---

## 4. Post-deploy data steps

Run these after the **first** production deploy (all are idempotent):

```bash
# 1. Built-in roles and permissions
npx convex run --prod setup/admin:seedAccessCatalog

# 2. Legacy memberships → project roles. Paginated: repeat with the returned
#    continueCursor until isDone is true.
npx convex run --prod setup/admin:migrateLegacyMemberships '{"cursor": null}'
npx convex run --prod setup/admin:migrateLegacyMemberships '{"cursor": "<continueCursor>"}'
```

On PowerShell, pass JSON arguments with escaped quotes, e.g.
`'{\"cursor\": null}'`.

### Aggregate backfill

Dashboard, team and digest counts come from `@convex-dev/aggregate`. After the
first deploy to a deployment that already holds feedback (and after any deploy
that adds a new aggregate), backfill them. It is idempotent, processes 100 rows
per transaction and reschedules itself until the log shows
`feedback aggregate backfill complete`:

```bash
npx convex run --prod feedback/store:backfillAggregates '{}'
```

Until it finishes, counts for existing projects are understated.

---

## 5. Backups and restore

- **Periodic backups**: Convex dashboard → production deployment → *Backups*
  → enable **periodic backups** (daily, or more often if your plan allows).
  Scheduled backups require a paid Convex plan. Keep at least 7 days.
- **Manual snapshot** before risky changes (schema changes, migrations, bulk
  deletes):

  ```bash
  npx convex export --prod --path ./backups/insightflow-$(date +%Y%m%d-%H%M).zip
  ```

  Add `--include-file-storage` if file storage is in use. Store exports
  encrypted and outside the repo; they contain personal data.
- **Restore drill** (do it once before launch, then quarterly): restore into a
  non-production deployment and check that the data came back.

  ```bash
  # into your dev deployment (or a preview deployment), never prod first
  npx convex import --replace-all ./backups/insightflow-YYYYMMDD-HHMM.zip
  npx convex run setup/admin:seedAccessCatalog   # sanity: should be a no-op
  ```

  Sign in, open a project, and compare counts with production. Write down how
  long it took (your recovery time).
- **Restoring production**: prefer *Backups → Restore* in the dashboard. With
  the CLI, `npx convex import --prod --replace-all <file>` overwrites production
  tables; take a fresh export first.

---

### Data deletion and retention

Users delete data themselves (README → *Data deletion*): feedback, invitation
links, organization members, projects, organizations and their own account.
Operational notes:

- **Background purges.** Project and organization deletion first set
  `deletionRequestedAt` (the record is invisible from then on), then run
  self-scheduling internal mutations (`projects/deletion:purge`,
  `organizations/deletion:purge`, `users/deletion:purgeRemaining`,
  `feedback/deletion:purgeChildren`). Watch the *Schedules* tab after a large
  deletion. A purge interrupted by a failed deploy can be resumed safely (each
  step is idempotent):

  ```bash
  npx convex run --prod projects/deletion:purge '{"projectId": "<id>"}'
  npx convex run --prod organizations/deletion:purge '{"organizationId": "<id>"}'
  ```

  Find leftovers in the dashboard data view by filtering `projects` or
  `organizations` on `deletionRequestedAt`.
- **Restore window.** Deleted projects and organizations stay restorable for
  7 days (*Workspace settings → Recently deleted*); the purge job runs after
  that. Deleting an account purges the organizations it owns immediately.
- **Crons.**
  - `purge stale invitations` (daily, 03:30 UTC) deletes invitation links that
    expired more than 30 days ago, accepted ones included.
  - Email retention (daily, 04:10 UTC) deletes stored email bodies 7 days
    after delivery and abandoned ones after 14 days, and trims the
    critical-alert log.
  - Orphaned attachment sweep (hourly) deletes uploaded files that were never
    attached to a feedback item. Any future feature that stores files must
    be added to its reference check in `convex/attachments/cleanup.ts`.
- **Data subject requests.** Users download their own data from the account
  menu; project admins export feedback (CSV/JSON) and erase a submitter's
  name and email in *Project settings → Data & privacy*.
- **Backups still hold deleted data** until they rotate out. Keep the backup
  retention in line with the privacy policy, and when you restore a backup,
  re-apply deletions requested after the snapshot was taken.
- **Requests by email.** For people who cannot use the self-serve flows, run
  the same public mutation (`users/deletion:deleteAccount`,
  `projects/deletion:remove`, …) from the dashboard's function runner with
  *Act as a user* set to the requester, never by editing tables by hand:
  hand edits skip the aggregates and the cascades.

---

## 6. Monitoring

- **Sentry (Next.js app)**: browser errors, error-boundary errors
  (`app/global-error.tsx`, workspace and feedback boundaries), and server
  request errors (`onRequestError` in `instrumentation.ts`). PII collection is
  turned off (`dataCollection` in `sentry.shared.config.ts`), and invitation
  tokens are rewritten to `/invitations/[token]` in URLs, breadcrumbs and
  span names before sending; traces are sampled at 5%. Browser events go through the same-origin `/monitoring`
  tunnel. Set up alerts for new issues and error spikes.
- **Backend failure alerts (built in, all plans)**: set `OPS_ALERT_EMAIL` on
  the Convex deployment to an address (or list/alias) the on-call person reads:

  ```bash
  npx convex env set OPS_ALERT_EMAIL ops@yourdomain.com --prod
  ```

  Every 15 minutes the `backend failure alerts` cron
  (`convex/monitoring/alerts.ts`) sends **one** email through Brevo when it
  finds:
  - **Failed scheduled functions**: jobs in `_scheduled_functions` with state
    `failed` that completed since the last run (a stored watermark keeps them
    from being reported twice). This covers the background chains Sentry never
    sees: project, organization and account purges, submitter erasure, the
    weekly digest, critical alerts, webhook delivery, and the retention/sweep
    crons. Failures are grouped by function name with the count, the first
    error message (email addresses replaced by `[email]`, truncated to 300
    characters) and up to 10 job ids.
  - **Stuck deletions**: projects and organizations still present more than
    the 7-day restore window + 1 day after deletion was requested (the purge
    never finished), with the state of their purge job.

  Throttling: at most one email per hour per failing function; failures seen
  while throttled are counted and reported in the next email. A stuck deletion
  is reported when first seen and then at most once a day. Without
  `OPS_ALERT_EMAIL` the cron logs one `console.error` per run and does nothing
  else; without `BREVO_API_KEY` no email can go out (use `EMAIL_DEV_LOG=true`
  on dev to see the alert in the logs).

  Limits: each run reads at most 2,000 recent scheduled jobs (newest first,
  created up to one day before the previous watermark). Jobs scheduled further
  ahead, such as the 7-day purges, are covered by the stuck-deletion check.
  Failures inside cron jobs themselves and errors in client-called functions
  are not in `_scheduled_functions`; use the integrations below for those.

  Manual check, e.g. after an alert or a deploy:

  ```bash
  npx convex run monitoring/alerts:recentFailures '{"limit": 50}' --prod
  ```

- **Convex exception reporting and log streams (recommended, paid plans)**:
  Convex dashboard → your production deployment → *Settings → Integrations*.
  - **Exception reporting (Sentry)**: create a separate Sentry project (for
    example `insightflow-convex`, platform *Node.js*), copy its DSN, then in
    *Integrations* choose *Sentry*, paste the DSN and save. Uncaught errors in
    every query, mutation, action, HTTP action and cron are sent with the
    function name and deployment. In Sentry, add an alert rule for new issues
    and for error spikes in that project.
  - **Log streams (Axiom or Datadog)**: in *Integrations* choose *Axiom*
    (dataset name + API token with ingest permission) or *Datadog* (site,
    API key, optional service name). Every function execution log line and
    status is streamed, which gives retention beyond the dashboard and lets
    you alert on `status = failure` per function, latency, or volume.
    A generic *Webhook* stream is also available.
  - Both require a Convex Pro plan. Keep `OPS_ALERT_EMAIL` set anyway: it is
    the only check for purges that never finished.
- **Convex dashboard**: *Logs* for live function logs, *Health* and
  *Insights* for failure rates, OCC conflicts, and functions close to read
  limits. Review Insights weekly.
- **Uptime**: point an external monitor at `/` and `/login`.

---

## 7. Release and rollback

**Normal release**: merge to `main` → CI (`.github/workflows/ci.yml`: lint,
route type generation with `next typegen`, typecheck, tests, build) → Vercel production deploy, which runs
`npx convex deploy --cmd 'pnpm build'`.

**Rollback**:

1. **Frontend**: Vercel → *Deployments* → previous good deployment →
   **Instant Rollback** (or *Promote to Production*). This does **not** roll
   back the backend.
2. **Backend**: revert the offending commit on `main` and redeploy, or check
   out the last good commit locally and run
   `CONVEX_DEPLOY_KEY=... npx convex deploy`. Convex has no one-click code
   rollback.
3. **Schema**: Convex rejects a deploy whose schema does not match existing
   data, so rolling back code past a schema change may need the data reverted
   too. Keep schema changes backward compatible (add optional fields first,
   backfill, then tighten) so old code keeps working.
4. **Data**: restore from the latest backup (section 5) only for data
   corruption, and only after taking a fresh export.
5. Record the incident: what broke, the detection time, and the fix.

---

## 8. Security checklist

Before launch and after any infrastructure change:

- [ ] **Headers** (check with `curl -sI https://app.example.com/`):
      `Content-Security-Policy`, `Strict-Transport-Security`
      (`max-age=63072000; includeSubDomains`), `X-Content-Type-Options`,
      `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- [ ] **CSP**: nonce-based with `'strict-dynamic'`, generated per request in
      `proxy.ts`. Open the browser console on `/`, `/login`, `/signup`,
      `/f/<slug>`, and a workspace page: no CSP violations. New third-party
      scripts must load through `next/script` (or carry the `x-nonce` value),
      and new origins must be added to `proxy.ts`.
- [ ] **HSTS preload** (optional): once every subdomain serves HTTPS, add
      `; preload` in `next.config.ts` and submit the domain to hstspreload.org.
- [ ] **Rate limits** on sign-in, sign-up, and public intake are active
      (Convex rate limiter component).
- [ ] **Captcha**: `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
      set, `INTAKE_CAPTCHA_DISABLED` unset. Check both `/f/<slug>` and
      `/signup` show the widget.
- [ ] **Email**: `BREVO_API_KEY` and `EMAIL_FROM` (a verified Brevo sender)
      set, `EMAIL_DEV_LOG` unset; a test sign-up code arrives.
- [ ] **Secrets**: deploy keys scoped to one environment; Sentry token only in
      build env; nothing secret in `NEXT_PUBLIC_*`.
- [ ] **Rotation** (yearly, or immediately after a suspected leak): Convex
      deploy keys (dashboard), `AUTH_GOOGLE_SECRET` (Google Console),
      `BREVO_API_KEY`, `TURNSTILE_SECRET_KEY`, `SENTRY_AUTH_TOKEN`, and
      `JWT_PRIVATE_KEY` + `JWKS` together (signs everyone out).
- [ ] **Legal**: this is a demo, so `lib/legal.ts` holds sample values and
      the pages show a demo notice. For a real launch set `DEMO_NOTICE` to
      false, replace the values, have counsel review the text, and build with
      `REQUIRE_LEGAL_VALUES=true` to block any leftover placeholders.
- [ ] **Backups** enabled and a restore drill done.
