---
name: better-auth
description: 'Adds, configures and debugs the Better Auth TypeScript library using docs for the installed version. Use when a project imports better-auth or has a betterAuth() config, or the user names Better Auth: setup, adapters, the auth CLI, route handlers, sessions, rate limits, trusted origins, email/password, two-factor or organizations.'
---

# Better Auth

Better Auth is configured in a server `betterAuth({ ... })` call, with a matching client and a database schema that plugins extend. Its API changes between releases, so ground every option, import path, and CLI flag in the documentation for the installed version, not memory.

`app-auth` (if installed) owns the policy: server-side authorization, ownership and tenant checks, cookie and CSRF rules, and redirect validation. Use it for the review of what these settings must achieve. This skill covers how to express them in Better Auth. Not for Auth.js, Clerk or other auth libraries.

## 1. Match the docs to the installed version

- **Find the version.** Take it from the user if they name one, else from the resolved `better-auth` entry in the lockfile, else from the `package.json` range.
- **Pick the docs line.** `https://better-auth.com/llms.txt` lists a documentation index for each release line (in October 2026: v1.8 beta, v1.7 latest, v1.6). Open the index for the project's line, find the page, and fetch its `.md` URL for plain Markdown. Cite the canonical URL without `.md`. The docs MCP server listed there (`mcp.better-auth.com`) serves the same pages, and Context7 is another route when connected.
- **Default to the latest line** only if no version can be found. For an upgrade, read both lines and say which advice belongs to the current version and which to the target.

## 2. Establish the project facts

Scan before asking. Detect the framework (`next.config.*`, `svelte.config.*`, `nuxt.config.*`, `astro.config.*`, Express, Hono, or TanStack Start files), the database and ORM (`prisma/schema.prisma`, `drizzle.config.ts` and its `dialect`, or a driver in `package.json`), any existing auth library, and the package manager.

Ask with AskUserQuestion only for what the scan can't answer, in one call:

- project type: new, adding to an existing app, or migrating from another library
- sign-in methods: email and password, social providers, magic link, passkey
- extra features: two-factor, organizations, admin, API keys
- whether email sending is real or a placeholder for now

Summarize the plan in a short checklist and get confirmation before editing.

## 3. Set up

Read [references/setup.md](references/setup.md) for install, environment variables, adapters, the CLI, and the route handler per framework. In outline:

1. Install `better-auth`, and add the `auth` CLI package as a dev dependency pinned to the same version, so the CLI doesn't run unpinned from the registry.
2. Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, and set `baseURL` explicitly. Request inference isn't recommended.
3. Create the server `auth.ts`, the client, and the route handler.
4. Generate or migrate the schema with the CLI, and apply it with the project's own migration tool for Prisma and Drizzle.
5. Verify with a real sign-up and sign-in, and call `GET <basePath>/ok` (`/api/auth/ok` by default) to confirm the handler is mounted.

## 4. Gotchas that cause most bugs

- **Re-run the CLI after any plugin change.** Plugins add tables and columns, and missing schema surfaces as runtime errors. Type errors after adding a plugin usually mean a stale generated schema or client plugin.
- **The config uses the ORM's model key, not the table name.** For Drizzle the adapter reads the key in the `schema` object you pass. To use a table named `users`, map it (`user: schema.users`) or set `user.modelName`.
- **Sessions go to `secondaryStorage` first.** When it is configured, sessions, verification records, and rate-limit counters are stored there and not in the database. Set `session.storeSessionInDatabase: true` to also keep sessions in the database. When the store is Redis, use an eviction policy that won't drop live sessions (see `redis`, if installed).
- **Session caching skips `customSession` output.** Neither the cookie cache nor secondary storage holds the fields your `customSession` function adds, so the function runs on every session fetch. Keep it cheap.
- **Without a database, sessions are stateless.** The session lives in the cookie, so revocation is limited. Changing `session.cookieCache.version` invalidates all of them.
- **`auth.api` calls skip rate limiting.** Rate limits apply to client requests only, and are off by default in development.
- **Mount the handler before body parsers** in Express, or the request body is consumed before Better Auth reads it. Express 4 and 5 use different catch-all patterns.
- **Add `nextCookies()` as the last plugin** to set cookies from Next.js server actions and components.
- **Use absolute `callbackURL` and `redirectTo` values** that are trusted origins. Relative paths must start with a single `/`.
- **Serverless needs a background task handler.** Set `advanced.backgroundTasks.handler` (for example `waitUntil`) so deferred work, such as sending email without blocking the response, still runs.

## 5. Plugin imports

Import paths differ by plugin family, and both forms below are valid for the in-package plugins. Use the form the project's existing code and the docs for its version use.

- **In-package server plugins** (two-factor, organization, admin, bearer, magic link, email OTP, username, phone number, JWT, multi-session, OpenAPI, and others) import from `better-auth/plugins`. The package also exports a per-plugin subpath for most of them (for example `better-auth/plugins/two-factor`, present in 1.7.10). Check the installed package's `exports` before using one. The organization docs use `better-auth/plugins/access` for `createAccessControl` to keep bundles small.
- **Client plugins** import from `better-auth/client/plugins`.
- **Separate packages** need their own install and import: `@better-auth/passkey`, `@better-auth/sso`, `@better-auth/api-key`, `@better-auth/oauth-provider` (to build an authorization server, also see `api-oauth-provider`, if installed), plus `@better-auth/stripe`, `@better-auth/scim`, and `@better-auth/expo` where the docs list them. Their client plugins come from the package's `/client` path.
- **Framework glue** has its own paths, such as `better-auth/next-js`, `better-auth/node`, `better-auth/svelte-kit`, and `better-auth/tanstack-start`.

Each plugin needs the server plugin, the matching client plugin, and a schema refresh.

## 6. Security settings

Express the `app-auth` policy with these options, and confirm each against the docs for the installed version.

- **Secret.** Set it from the environment. Production throws when no secret is configured. `secrets` supports versioned rotation.
- **Trusted origins.** `trustedOrigins` gates origin checks and callback URLs. List exact origins, and remove localhost from production. Wildcards must be deliberate.
- **Never disable the checks.** `advanced.disableCSRFCheck` and `advanced.disableOriginCheck` weaken protection, and `disableOriginCheck` also disables CSRF protection.
- **Rate limits.** Set storage to the database or secondary storage on multi-instance or serverless deployments. The default memory store resets on restart. Per-path rules in `rateLimit.customRules` use paths relative to the base path (`/sign-in/email`). A custom store implements an atomic `consume`, and the older separate `get` and `set` shape is no longer accepted.
- **Client IP.** Point `advanced.ipAddress.ipAddressHeaders` at a single header your proxy overwrites, or list your proxies in `advanced.ipAddress.trustedProxies`. Only enable `advanced.trustedProxyHeaders` behind a proxy that sets the forwarded host and protocol, because forged headers can steer redirects and callback URLs.
- **Sessions.** Tune `session.expiresIn`, `updateAge`, and `freshAge`. Endpoints marked fresh-only, such as sensitive account changes, require a session created within `freshAge` (default one day), so shorten it for step-up behavior.
- **OAuth tokens.** `account.encryptOAuthTokens: true` encrypts provider tokens you store. PKCE and state are built in, and `account.storeStateStrategy` selects where state lives.
- **Audit.** Use `databaseHooks` (session, user, and account create, update, and delete) or endpoint `hooks` to write audit events. A `before` database hook can block an operation.
- **Verification.** Require verified email for password sign-in with `emailAndPassword.requireEmailVerification`, and decide the policy for `account.accountLinking`.

## 7. Feature references

Read these only for the feature at hand.

- [references/email-password.md](references/email-password.md): email verification, password reset, session revocation, password hashing, and enumeration protection.
- [references/two-factor.md](references/two-factor.md): TOTP, OTP, backup codes, trusted devices, and the sign-in flow.
- [references/organization.md](references/organization.md): organizations, members, invitations, roles and permissions, and teams.

## 8. Verify

Run a real flow against a disposable database: sign up, verify, sign in, read the session on the server (`auth.api.getSession({ headers })`), and sign out. Exercise each plugin's failure path (bad code, expired token, wrong origin). Then check logs and responses for leaked tokens, and use `app-auth` section 7 (if installed) for the cross-user denial check.

## Provenance

Written from the Better Auth documentation (better-auth.com/docs, 1.7 line, rechecked against 1.7.10 in October 2026). The upstream `better-auth/skills` repository has no license, so no text from it is used.
