# DbContext lifetime and migrations

Contents: registration choices, background work, configuration, migration workflow, applying migrations, seeding, tooling notes.

Check details against the installed EF Core version (Microsoft Learn "DbContext lifetime, configuration and initialization" and "Migrations overview", or Context7).

## Registration

| Registration | Lifetime | Use |
|---|---|---|
| `AddDbContext<T>(o => ...)` | Scoped | Default for web apps: one context per request |
| `AddDbContextPool<T>(o => ..., poolSize)` | Scoped, instances reused | Hot apps where context construction shows up in profiles |
| `AddDbContextFactory<T>(o => ...)` | Factory singleton, contexts you create and dispose | Background services, Blazor Server components, parallel work |
| `AddPooledDbContextFactory<T>(o => ...)` | Pooled factory | Same, with pooling |

```csharp
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("App"))
     .UseSnakeCaseNamingConvention());   // only if the project already uses this plugin
```

- Connection strings come from configuration (user secrets locally, a secret store in production), never source.
- Pooling resets context state between uses, but fields you add to the context class are not reset: a pooled context must not keep per-request state (tenant ID, user) in fields set by its constructor. Set such state per use from a scoped service (the pooled-factory pattern in the EF docs), or don't pool.
- Pooled contexts can't use `OnConfiguring` that depends on scoped services.
- Enable retries for transient failures with the provider option (`o.UseSqlServer(cs, x => x.EnableRetryOnFailure())`, `UseNpgsql(cs, x => x.EnableRetryOnFailure())`). With retries on, wrap user-initiated transactions in `db.Database.CreateExecutionStrategy().ExecuteAsync(...)`.

## Background services and parallel work

A hosted service is a singleton, so it can't take a scoped `DbContext`:

```csharp
public sealed class Reindexer(IDbContextFactory<AppDbContext> factory, ILogger<Reindexer> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        while (await timer.WaitForNextTickAsync(ct))
        {
            await using var db = await factory.CreateDbContextAsync(ct);
            await db.Products.Where(p => p.NeedsReindex)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.NeedsReindex, false), ct);
        }
    }
}
```

If the factory isn't registered, create a scope with `IServiceScopeFactory.CreateAsyncScope()` per unit of work instead. One context per concurrent operation; never share one across `Task.WhenAll` branches.

## Configuration that bites

- `EnableSensitiveDataLogging()` and `EnableDetailedErrors()`: development only.
- `UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking)` as a global default changes semantics for every update path; set it only for read-only contexts.
- Lazy-loading proxies: avoid in server apps (N+1, sync I/O).
- Value converters and `HaveConversion` in `ConfigureConventions` apply model-wide; check migrations after adding one.

## Migration workflow

```bash
dotnet tool restore                      # dotnet-ef from the local tool manifest, version matched to EF Core
dotnet ef migrations add AddOrderStatus --project src/App.Data --startup-project src/App.Api
dotnet ef migrations script --idempotent --output artifacts/migrate.sql
dotnet ef migrations has-pending-model-changes   # EF 8+: non-zero exit if the model changed without a migration
```

- Install `dotnet-ef` as a local tool (`dotnet new tool-manifest` then `dotnet tool install dotnet-ef`) with the same major version as the EF Core packages. The startup project needs `Microsoft.EntityFrameworkCore.Design` (`PrivateAssets="all"`).
- Multi-targeted projects (`<TargetFrameworks>`) need `--framework net10.0` on EF 10 tools.
- Name migrations for the change (`AddOrderStatus`), not `Update1`.
- Review every generated migration before committing: renames often come out as drop-and-add (data loss). Fix them with `migrationBuilder.RenameColumn(...)` / `RenameTable(...)`.
- Data-moving steps go in the migration (`migrationBuilder.Sql(...)`), written to be safe on large tables (batches, no long locks), or in a separate backfill.
- Removing the last unapplied migration: `dotnet ef migrations remove`. Never edit or delete a migration that has reached a shared database; add a new one.
- Zero-downtime changes take several deployments (expand, migrate code, contract): add nullable column, backfill, switch reads, then make it required or drop the old one.

## Applying migrations

| Method | When |
|---|---|
| Idempotent SQL script (`migrations script --idempotent`) reviewed and run by the deploy pipeline or DBA | Production default |
| Migration bundle: `dotnet ef migrations bundle --self-contained -r linux-x64`, then `./efbundle --connection "$CS"` | Pipelines that prefer an executable over SQL |
| `db.Database.MigrateAsync()` at startup | Local development and single-instance apps only |
| `dotnet ef database update` | Your own development database |

- Several instances calling `Migrate()` at startup race. EF 9 added a migration lock, but startup migration still couples deploy and schema and needs DDL rights for the app account; prefer a separate step.
- EF 9+ throws when applying migrations while the model has changes no migration captures (`PendingModelChangesWarning`), and when `Migrate()` runs inside a user transaction. Add the missing migration; don't suppress the warning to make it start.
- EF 10 no longer wraps all pending migrations in one transaction (reverting EF 9); each migration runs in its own.
- Don't run `database update`, a bundle or a script against any shared database without the user's approval.
- Never call `EnsureCreated()` in an app that uses migrations; it creates the schema without the history table, and later migrations fail.

## Seeding

- Reference data that belongs to the schema: `modelBuilder.Entity<Country>().HasData(...)` (lands in migrations; keys must be fixed).
- Data that needs logic or depends on environment: `UseSeeding` / `UseAsyncSeeding` in options (EF 9+), which run on `Migrate()` and `EnsureCreated()`. Make them idempotent.
- Test data stays in tests.

## Tooling notes

- Design-time creation: if the startup project can't build the context (no host, needs args), add an `IDesignTimeDbContextFactory<T>` in the data project.
- Reverse engineering an existing database: `dotnet ef dbcontext scaffold "<connection>" <Provider> --output-dir Models --context-dir Data --no-onconfiguring`; keep the connection string out of the generated code.
- Compiled models (`dotnet ef dbcontext optimize`) speed startup for very large models and are required for NativeAOT; regenerate them after every model change.
