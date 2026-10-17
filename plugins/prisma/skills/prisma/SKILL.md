---
name: prisma
description: Prisma ORM 6 and 7 traps for TypeScript backends, such as updateMany returning a count, interactive transaction timeouts, migrate dev resets, edited applied migrations, undefined filters, P2002/P2025/P2003 handling, serverless connections and driver adapters. Use when writing a Prisma schema, query, transaction or migration, or debugging one.
---

# Prisma

Traps in Prisma ORM's `PrismaClient` API (versions 6 and 7) that compile cleanly and fail in production. For schema design in general use `db-schema-design`, and for PostgreSQL tuning `postgres`, if installed.

Adapted from the ECC (everything-claude-code) `prisma-patterns` skill (MIT, Copyright (c) 2026 Affaan Mustafa), trimmed and corrected against the Prisma docs.

## Check the version first

Run `npm ls prisma @prisma/client` (or the repo's package manager) before writing any Prisma code.

- **Prisma 7** requires a driver adapter, a generated client with an explicit `output`, and `prisma.config.ts` for the datasource URL; the CLI no longer loads `.env` or runs `generate` after `migrate dev`. Read [references/prisma-7.md](references/prisma-7.md) when the repo is on 7 or upgrading from 6.
- **Prisma 8** is a TypeScript rewrite with a different API: `@prisma/orm-postgres`, `contract.prisma`, `prisma contract emit` and `db.ts` instead of `PrismaClient`, and no `P2xxx` codes. Nothing below applies to it; read the docs at prisma.io/docs for it.
- An unpinned `npx prisma` now fetches the Prisma 8 CLI, which has no `generate`, `migrate dev` or `db push` and does not read `schema.prisma`. In a 6 or 7 repo, run the locally installed binary (`npx prisma` inside the repo with it in `devDependencies`) or pin it (`npx prisma@7`), and keep `prisma` and `@prisma/client` on the same major.
- Check APIs against the installed version with Context7 (`resolve-library-id` "Prisma", then `query-docs`); the v7 docs live under `/orm/v7`.

## Traps

### Bulk writes return a count

`updateMany`, `deleteMany` and `createMany` return `{ count }`, never rows. To get rows back, use `updateManyAndReturn` or `createManyAndReturn` (PostgreSQL, CockroachDB and SQLite; `updateManyAndReturn` since 6.2). Elsewhere, select the ids first and update `where: { id: { in: ids } }` inside one transaction. Use `count === 0` as the "someone else changed it" signal for optimistic concurrency, with the version column in `where`.

### `undefined` in a filter means "no filter"

`where: { email: undefined }` matches every row, so `deleteMany({ where: { authorId: input.authorId } })` with a missing input deletes the table, and `deleteMany()` with no argument does the same. Validate inputs before they reach a bulk `where`, and treat any `deleteMany`/`updateMany` whose filter is built from request data as a review item. `null` is a real value (`IS NULL`); `undefined` drops the condition. The `strictUndefinedChecks` preview flag (since 5.20) turns an explicit `undefined` into a runtime error, with `Prisma.skip` for intended omissions.

### Interactive transactions time out

`prisma.$transaction(async (tx) => ...)` defaults to `maxWait: 2000` ms to start and `timeout: 5000` ms to finish, after which the transaction is rolled back and later calls fail with a "transaction already closed" error (`P2028`).

- Keep HTTP calls, email and queues outside the transaction. Do the external call before, or after commit via an outbox row.
- Inside the callback use `tx` only. A query on the outer `prisma` runs outside the transaction and won't roll back.
- Raise `timeout` per call only for real bulk work, and set it on the client (`transactionOptions`) only with a reason.
- Use the array form, `$transaction([a, b])`, when steps don't depend on each other's results.

### `migrate dev` can reset the database

`migrate dev` replays the history in a shadow database and prompts to reset (drop all data) when it finds drift or a modified or missing migration. Run it only against a local, disposable database. CI and every shared environment run `migrate deploy`, which applies pending migrations and never resets. `migrate reset` is development-only.

### Never edit an applied migration

Prisma stores each migration's checksum in `_prisma_migrations`. Editing a migration file after it ran makes `migrate dev` demand a reset, while `migrate deploy` only prints a "modified since they were applied" warning and does not re-run it, so the edit silently never reaches environments that already applied it. Write a new migration instead. Breaking changes (a new `NOT NULL` column, a rename) go expand, backfill, contract across separate migrations.

### `@updatedAt` is Prisma-side only

Prisma Client fills `@updatedAt` on its own writes, but the database knows nothing about it: raw SQL (`$executeRaw`), other services, triggers and SQL migrations leave it stale. An update with an empty `data` leaves it unchanged. Set it explicitly in raw writes, or use a database default plus trigger when other writers exist.

### Error codes to translate

Catch `Prisma.PrismaClientKnownRequestError` at the service boundary (import `Prisma` from the generated client path in 7) and map codes to domain errors. Never pass raw Prisma messages to API clients.

| Code | Meaning | Usual mapping |
| --- | --- | --- |
| `P2002` | Unique constraint failed (`e.meta?.target` names the fields) | 409 Conflict |
| `P2025` | Record required by `update`, `delete`, a nested write or `*OrThrow` not found | 404 |
| `P2003` | Foreign key constraint failed | 400 or 409 |

Prefer catching `P2002` from the insert over a find-then-create check, which races.

### Soft delete and `findUniqueOrThrow`

A soft-deleted row still exists, so `findUniqueOrThrow({ where: { id } })` returns it. `findUnique` accepts only unique fields, so adding `deletedAt: null` there is a type error. Use `findFirstOrThrow({ where: { id, deletedAt: null } })`, and filter `deletedAt: null` explicitly in every query (a Client Extension can centralize it; middleware is gone in 7).

### Connections in serverless

Each `PrismaClient` owns a connection pool, and each serverless instance gets its own client.

- Create one client per process. In dev, cache it on `globalThis` so hot reload doesn't open a new pool per reload.
- Prisma 6: cap the pool in the URL (`?connection_limit=1`), and add `pgbouncer=true` behind PgBouncer in transaction mode.
- Prisma 7: the pool belongs to the driver adapter (`pg` defaults to `max: 10` and no connection timeout), and the v6 URL parameters don't apply. Set `max` on the adapter and put an external pooler in front.
- Point the CLI (`prisma.config.ts` `datasource.url` in 7, `directUrl` in 6) at a direct, non-pooled connection for migrations.

### Never return entities from APIs

Returning a Prisma row leaks columns such as `passwordHash` and `deletedAt`, and any column added later. Use `select` on hot paths and map to a response DTO at the boundary; `omit` hides fields per query or per client but doesn't replace the DTO.

### Relation loading

`include`/`select` on a relation runs one extra query per relation level by default, not per row. Database-level joins need the `relationJoins` preview flag (PostgreSQL, CockroachDB, MySQL); with the flag on, `relationLoadStrategy: "join"` becomes the default and can be set per query to `"query"`. A join on a large one-to-many relation can return far more data, so measure both. The real N+1 is a query inside a loop: load the relation with `include`, or batch with `where: { id: { in: ids } }`.

### Pagination

Cursor pagination needs a unique, stable sort: `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, `take: limit + 1` to detect a next page, and `cursor: { id }, skip: 1`. Offset (`skip`) is for admin tables that jump to page N; it slows down as the offset grows.

## Validate

- Run `prisma validate` and `prisma format` after schema edits, then `prisma generate` (explicitly in 7) and the type check.
- Review the SQL that `migrate dev --create-only` writes before applying it, and look for drops, renames and table rewrites.
- Test transactions and error mapping against a real database (a container or a disposable branch), not a mocked client.
