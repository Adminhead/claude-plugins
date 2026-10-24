---
name: ef-core
description: 'Writes, reviews and tunes EF Core data access: query shape, tracking, Include vs split queries, N+1, bulk ExecuteUpdate/Delete, DbContext lifetime, migrations, raw SQL parameters, and Dapper code beside it. Use for DbContext or LINQ-to-entities code, a slow EF query, dotnet ef migrations, or reviewing a repository or import job.'
---

# EF Core

Fix data access by reducing round-trips, duplicated rows, scans and needless materialization, and keep the contract the caller depends on. Separate what the code proves from what only a SQL log or query plan can show.

Not for: schema and relationship design in general (`db-schema-design`), engine tuning, indexes and plans beyond the model (`postgres`, `mysql`), raw ADO.NET, endpoint and DTO work (`aspnet-core`), integration test setup (`dotnet-testing`), EF version upgrades as a project (`dotnet-upgrade-guide`).

## Orient

- Read the `.csproj` (EF Core and provider package versions, TFM), the `DbContext` and its `OnModelCreating` / `IEntityTypeConfiguration` classes, the `Migrations/` folder, and where the context is registered (`AddDbContext`, `AddDbContextPool`, `AddDbContextFactory`).
- Follow repository and unit-of-work implementations rather than trusting interface names. Use the codebase-memory tools when the repo is indexed (`search_graph` for `DbSet<`, `trace_path` from a slow endpoint to its queries), else the C# language server (csharp-ls) or Grep.
- Don't use an API newer than the installed EF Core version (examples below are tagged). EF Core 10 needs .NET 10. Check provider-specific behavior with Context7 or the provider docs.

## Review workflow

1. Find the EF boundary: `DbContext`, `DbSet`, repository, query helpers, model building.
2. Trace each query to where it executes. Check whether operators bind to `Queryable` or `Enumerable` (also inside helpers): a `List<T>` has already loaded rows, and an `IEnumerable<T>` can hide a deferred query that runs again on every enumeration.
3. Count database operations and transaction boundaries along the call path, including saves hidden in repositories, audit hooks and progress callbacks. Note which operations share one `DbContext`.
4. For each path inspect predicates, projections, result bounds, ordering, Includes, tracking, parameterization and model configuration.
5. Preserve: result membership and order, page-number access, generated keys, retries, transaction and partial-failure behavior, concurrency tokens, domain events and interceptors.
6. Report findings by priority with location, call path, impact and a safe fix. Name what was sound and what wasn't validated. Recommend runtime validation for source-only reviews.

## Gate source-only findings

- A load-mutate loop with one `SaveChanges` at the end is not "SaveChanges in a loop".
- Missing `HasIndex` in one file doesn't prove the database lacks the index; look at the full model, migrations or a plan before recommending one.
- Missing `AsNoTracking` matters only for read-only entity results. Scalar projections track nothing; an entity inside a DTO is still tracked.
- If everything reviewed is sound, say no changes are needed.

## Capture SQL before and after

```csharp
optionsBuilder.LogTo(Console.WriteLine, LogLevel.Information);
// or "Microsoft.EntityFrameworkCore.Database.Command": "Information" in appsettings.json
var orders = await db.Orders.TagWith("OrdersPage").Where(...).ToListAsync(ct);
```

Count statements and rows per operation before and after each change. EF 10 redacts inlined constants in logs; `EnableSensitiveDataLogging()` (development only) shows values.

## Fixes at a glance

| Symptom | Fix |
|---|---|
| Same SELECT once per row (N+1), lazy loading | Project with `Select`, or `Include`; no lazy-loading proxies in server apps |
| Rows loaded then filtered or counted in memory | Keep `Where`/`Select`/`Count`/`Any` on `IQueryable` until execution |
| Several collection Includes, duplicated wide rows | Narrow projection, or `AsSplitQuery()` with stable ordering |
| Deep `Skip`/`Take` pages slow down | Keyset pagination on a unique, stable order |
| Load entities just to update or delete | `ExecuteUpdateAsync`/`ExecuteDeleteAsync` (EF 7+) after checking tracking, concurrency and atomicity |
| Function on a column in `Where` (`.Year`, `ToLower`, `ToString`) | Range on the bare column, or an indexed computed/normalized column |
| Hot one-shape query dominated by translation cost | `EF.CompileAsyncQuery` |
| Request values baked into hand-built expression trees | Capture values via closures so the query shape stays stable |
| Growing import gets slower per row | Stop enumerating the change tracker per row; rotate or clear an owned context between batches |
| Two queries in flight on one context | Await sequentially, or one context per concurrent operation (`IDbContextFactory<T>`) |

Read [references/query-fixes.md](references/query-fixes.md) before writing any of these fixes: it has the code, the conditions under which each fix is safe, and how to verify it.

## Raw SQL

Use the interpolated APIs, which send values as parameters: `FromSql($"... {id}")`, `SqlQuery<T>($"...")`, `ExecuteSqlAsync($"...")`. `FromSqlRaw`/`ExecuteSqlRawAsync` with string concatenation is SQL injection unless every fragment is a trusted identifier; EF 10 has an analyzer that warns on concatenation there. Identifiers (table or column names) can't be parameters: whitelist them.

## DbContext lifetime and migrations

- A `DbContext` is a unit of work: scoped per request in web apps, one per operation in background services (`IDbContextFactory<T>` or a new DI scope), never singleton or static, never shared across threads.
- `AddDbContextPool` cuts allocation cost for hot apps; pooled contexts must not keep per-request state in fields.
- Schema changes go through migrations: `dotnet ef migrations add <Name>`, review the generated code and SQL (`dotnet ef migrations script --idempotent`), and deploy with a script or bundle rather than `Database.Migrate()` racing across instances. Never mix `EnsureCreated()` with migrations.
- Don't run `dotnet ef database update` (or anything else that writes to a shared database) without the user's approval; add the migration and show it.

Read [references/migrations-and-lifetime.md](references/migrations-and-lifetime.md) for registration choices, background-service patterns, the migration workflow, bundles, seeding and multi-target `--framework` rules.

## Version notes and Dapper

- EF Core 10 behavior changes (parameterized collections as multiple parameters, `ExecuteUpdateAsync` taking a plain lambda, named query filters, `LeftJoin`, JSON and complex-type column changes, SQLite date handling): [references/ef-core-10.md](references/ef-core-10.md).
- Dapper code next to EF Core, or a decision between them: [references/dapper.md](references/dapper.md). For Dapper or raw ADO.NET code, answer in SQL and Dapper terms; don't introduce a `DbContext` or EF-only APIs.

## Verify

- Build, then run the affected tests (the repo's integration tests should use the real provider, not InMemory).
- With a database available: the SQL log shows the expected statement count and shape, and the plan uses the intended index. Without one, say which claims are source-only.
- For migrations: `dotnet ef migrations has-pending-model-changes` (EF 8+) reports none after adding the migration, and the generated SQL matches intent (no unexpected drops or renames).

## Gotchas

- `AsNoTracking` doesn't deduplicate repeated keys into one object; `AsNoTrackingWithIdentityResolution` does, per query.
- A filtered `Include` on a tracking context can come back with extra children already tracked from earlier queries.
- `ExecuteUpdate`/`ExecuteDelete` run immediately, skip the change tracker, interceptors on `SaveChanges`, client-side cascades and concurrency-token checks, and aren't part of a later `SaveChanges` unless you open a transaction yourself.
- `Add`/`AddRange` don't call `DetectChanges`; swapping one for the other fixes nothing.
- A second `OrderBy` replaces the first; use `ThenBy`.
- EF 9+ throws when applying migrations while the model has changes no migration captures (`PendingModelChangesWarning`); add the missing migration rather than suppressing the warning.
