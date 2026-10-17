# Prisma ORM 7 setup and upgrade

Read this when the repo is on Prisma 7 or moving from 6 to 7. Checked against the Prisma docs (`/guides/upgrade-prisma-orm/v7`, `/orm/v7`) in October 2026. Minimums: Node 20.19, TypeScript 5.4. Prisma ships as an ES module, so the consuming `tsconfig` needs an ESM-capable `module` setting.

## What changed from 6

| Area | Prisma 6 | Prisma 7 |
| --- | --- | --- |
| Generator | `prisma-client-js`, output in `node_modules` | `prisma-client` with a required `output`; import from that path |
| Client construction | `new PrismaClient()` reads the URL from the schema | A driver adapter is required for every database |
| Datasource URL | `url`/`directUrl` in `schema.prisma` | `datasource.url` in `prisma.config.ts`, used by the CLI |
| `.env` | Loaded by the CLI | Not loaded; `import "dotenv/config"` in `prisma.config.ts` (Bun loads `.env` itself) |
| `migrate dev`, `db push` | Run `generate`, and `migrate dev`/`reset` run the seed | Neither; run `prisma generate` and `prisma db seed` yourself |
| Seed command | `package.json` `prisma.seed` | `migrations.seed` in `prisma.config.ts` |
| Pool | Prisma's pool, tuned by URL params | The driver's pool, tuned on the adapter |
| Middleware (`$use`) | Available | Removed; use Client Extensions (`$extends`) |
| Metrics | Preview | Removed |
| `migrate diff` | `--from-url`, `--to-schema-datasource`, `--shadow-database-url` | `--from-config-datasource`/`--to-config-datasource`; shadow URL in the config |
| `db execute` | `--schema`, `--url` | Connection from `prisma.config.ts` only |
| SSL | Invalid certificates ignored | `pg` validates them; fix the CA or pass `ssl` options to the adapter |

## Minimal setup (PostgreSQL)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

```ts
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DIRECT_URL") }, // direct connection for migrations
});
```

```ts
// src/lib/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5_000 }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

SQLite uses `@prisma/adapter-better-sqlite3` (`new PrismaBetterSqlite3({ url })`); other databases have their own adapter packages. Commit or ignore the generated client by the repo's convention, and run `prisma generate` in CI and in the build before the type check.

## Pool defaults for the `pg` adapter

| Behavior | v6 URL parameter (default) | v7 `pg` field (default) |
| --- | --- | --- |
| Pool size | `connection_limit` (physical CPUs × 2 + 1) | `max` (10) |
| Acquire and connect timeout | `pool_timeout` (10 s), `connect_timeout` (5 s) | `connectionTimeoutMillis` (0, waits forever) |
| Idle timeout | `max_idle_connection_lifetime` (300 s) | `idleTimeoutMillis` (10 s) |

Requests that hang after an upgrade usually mean the pool is exhausted and `connectionTimeoutMillis` is still 0. Set a timeout and size `max` to the database's limit divided by the number of instances.

## Accelerate

Don't pass a `prisma://` or `prisma+postgres://` URL to a driver adapter; it expects a direct connection string. Accelerate uses `new PrismaClient({ accelerateUrl })` with its extension and no adapter. Standalone Accelerate and the hosted `accelerate.prisma-data.net` connections are announced for retirement on 1 December 2026, so plan a move to a direct or pooled TCP URL.
