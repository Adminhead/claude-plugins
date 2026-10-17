# Better Auth setup

Read this when installing Better Auth, choosing an adapter, running the CLI, or mounting the route handler. Details come from the Better Auth 1.7 docs (`better-auth.com/docs/installation`, `concepts/cli`, `concepts/database`, `adapters/*`, `integrations/*`). Confirm against the docs for the installed version.

## Install and pin the CLI

```bash
<pm> add better-auth
<pm> add -D auth@<same version as better-auth>
```

The `auth` package is the CLI. Its version tracks `better-auth` (both 1.7.10 when last checked, October 2026), so pin it to match. The docs use `npx auth@latest ...`, which fetches an unpinned package on each run. With the pinned dev dependency, run the local binary (`npx auth generate`, `pnpm exec auth generate`) so the CLI that reads your config is the one that matches the library. `auth upgrade` moves `better-auth` and the synchronized official `@better-auth/*` packages together.

Scoped packages install separately when needed: `@better-auth/passkey`, `@better-auth/sso`, `@better-auth/api-key`, `@better-auth/oauth-provider`, `@better-auth/stripe`, `@better-auth/scim`, `@better-auth/expo`. Keep them at the same version as `better-auth`.

## Environment

```
BETTER_AUTH_SECRET=<generated secret>   # openssl rand -base64 32, or: auth secret
BETTER_AUTH_URL=<public base URL of the app>
DATABASE_URL=<connection string>
```

Better Auth reads `BETTER_AUTH_SECRET` or `AUTH_SECRET`. A default secret is used in development, and production throws when none is set. Set `baseURL` (or `BETTER_AUTH_URL`) explicitly. Inferring it from the request is not recommended. Put only provider client IDs and secrets you actually use in the environment, and never commit them. Use `BETTER_AUTH_SECRETS` (`<version>:<value>,...`) to rotate the secret without invalidating existing data.

Without `--config <path>`, the CLI searches for `auth.ts` at the project root, in `lib/` and `utils/`, and in the same folders under `src/`. Put the file elsewhere only with the flag.

## Database adapters

| Database | `database` value |
| --- | --- |
| SQLite | a `better-sqlite3` (or `bun:sqlite`) instance |
| PostgreSQL | a `pg` `Pool` (the docs also cover postgres.js and Neon) |
| MySQL | a `mysql2` pool |
| Drizzle | `drizzleAdapter(db, { provider: "pg" \| "mysql" \| "sqlite" })` from `better-auth/adapters/drizzle` |
| Prisma | `prismaAdapter(prisma, { provider: "postgresql" \| "mysql" \| "sqlite" ... })` from `better-auth/adapters/prisma` |
| MongoDB | `mongodbAdapter(client)` from `better-auth/adapters/mongodb` |

- The Drizzle `provider` must match the driver in use.
- With Drizzle you must pass a real `db` created with `drizzle(...)`, and `drizzle-kit` commands need a `drizzle.config.ts` that points at the generated schema file and the database credentials.
- With an ORM adapter, the docs suggest importing `betterAuth` from `better-auth/minimal` to cut bundle size. Check the page for your version before adopting it.
- Rename tables and columns with `user.modelName`, `user.fields`, and the matching `session`, `account`, and `verification` keys. With Drizzle you can instead map the schema keys.
- ID generation is controlled by `advanced.database.generateId` (a function, `"serial"`, `"uuid"`, or `false`). Setting it to `false` without a function turns off generation for every table.

## CLI

| Command | Use |
| --- | --- |
| `auth generate` | Writes the schema for your adapter. `--output <path>` sets the file, `--adapter prisma\|drizzle\|kysely` and `--dialect <db>` generate without a live connection (Drizzle needs `--dialect`) |
| `auth migrate` | Applies the schema directly. Works only with the built-in Kysely adapter |
| `auth check` | Verifies the configured schema can hold what Better Auth writes. `auth check schema` limits it to that. It does not apply migrations |
| `auth info` | Prints diagnostics with secrets redacted. `--json` for sharing |
| `auth secret` | Prints a new secret |
| `auth upgrade` | Updates `better-auth` and synchronized `@better-auth/*` packages to the CLI's version |
| `auth create-admin` | Creates the first admin through the Admin plugin. It prompts for the password when omitted, so don't put one in shell history |
| `auth init` | Scaffolds a project. Limited to Next.js and SQLite |

Per adapter, the schema workflow is:

- **Built-in Kysely.** `auth migrate`.
- **Prisma.** `auth generate --output prisma/schema.prisma`, then apply with `prisma migrate dev`, or the project's production migration command.
- **Drizzle.** `auth generate --output <schema file>`, then `drizzle-kit generate` followed by `drizzle-kit migrate`. `drizzle-kit push` applies the diff directly with no migration file, which suits prototypes and not reviewed production changes.

Re-run the workflow after adding, removing, or reconfiguring a plugin. Review the generated diff before applying it, and run `auth generate` and migrations against a disposable database first. For a non-default Postgres schema, set `database.schemaName`.

## Route handlers

Mount the handler at the base path (`/api/auth` by default, changed with `basePath`).

| Framework | Handler |
| --- | --- |
| Next.js App Router | `app/api/auth/[...all]/route.ts`: `export const { GET, POST } = toNextJsHandler(auth)` from `better-auth/next-js` |
| Next.js Pages | `export default toNodeHandler(auth.handler)` from `better-auth/node`, with `export const config = { api: { bodyParser: false } }` |
| Express | `app.all("/api/auth/*", toNodeHandler(auth))` from `better-auth/node`, mounted before body-parsing middleware. Express 5 needs `/api/auth/*splat` |
| Hono | `app.all("/api/auth/*", (c) => auth.handler(c.req.raw))` |
| SvelteKit | `svelteKitHandler` from `better-auth/svelte-kit` in `hooks.server.ts`, plus `sveltekitCookies` |
| Nuxt | `server/api/auth/[...all].ts` calling `auth.handler(toWebRequest(event))` |
| SolidStart | `toSolidStartHandler` from `better-auth/solid-start` |
| TanStack Start | a server route forwarding to `auth.handler(request)`, plus `tanstackStartCookies` |
| Astro | `pages/api/auth/[...all].ts` calling `auth.handler(ctx.request)` |

Next.js 16 renamed middleware to proxy. In a proxy or middleware file, check only for the session cookie's existence for a fast redirect, and do the real session validation in the page or route that needs it, because a cookie's presence doesn't prove a valid session.

## Client

Create the client from the framework's entry: `better-auth/react`, `better-auth/vue`, `better-auth/svelte`, `better-auth/solid`, or `better-auth/client` for vanilla. Client plugins go in `createAuthClient({ plugins: [...] })`. Infer session types with `typeof auth.$Infer.Session` or `typeof authClient.$Infer.Session`. To type custom user or session fields on the client, add `inferAdditionalFields<typeof auth>()` from `better-auth/client/plugins` when server and client share a project, or pass the field schema to `inferAdditionalFields({ ... })` when they don't.

Server-side session check, for example in a Next.js server component:

```ts
const session = await auth.api.getSession({ headers: await headers() });
```
