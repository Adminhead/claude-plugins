# EF Core 10 notes

EF Core 10 (November 2025, LTS until November 2028) needs the .NET 10 SDK and runtime; it doesn't run on earlier .NET or .NET Framework. Use these notes when touching code on EF 10, or when a 9 to 10 upgrade changed behavior. A whole-project upgrade is `dotnet-upgrade-guide` work.

## New APIs worth using

- **Named query filters**: several filters per entity, switched off individually.

  ```csharp
  modelBuilder.Entity<Blog>()
      .HasQueryFilter("SoftDelete", b => !b.IsDeleted)
      .HasQueryFilter("Tenant", b => b.TenantId == _tenantId);

  var all = await db.Blogs.IgnoreQueryFilters(["SoftDelete"]).ToListAsync(ct);
  ```

- **`LeftJoin` / `RightJoin`** LINQ operators (.NET 10) translate to `LEFT JOIN` / `RIGHT JOIN`, replacing the `GroupJoin` + `SelectMany` + `DefaultIfEmpty` pattern. Query syntax doesn't support them yet.
- **`ExecuteUpdateAsync` takes a plain lambda**, so setters can be conditional:

  ```csharp
  await db.Blogs.Where(b => b.Id == id).ExecuteUpdateAsync(s =>
  {
      s.SetProperty(b => b.Views, b => b.Views + 1);
      if (rename) s.SetProperty(b => b.Name, newName);
  }, ct);
  ```

  Code that built `Expression<Func<SetPropertyCalls<T>, SetPropertyCalls<T>>>` trees by hand no longer compiles; replace it with the lambda.
- **Complex types**: optional complex types (`Address? BillingAddress`, needs at least one required property), struct complex types, and mapping to a JSON column with `ComplexProperty(c => c.Address, c => c.ToJson())`. `ExecuteUpdateAsync` can set properties inside JSON columns only when they're mapped as complex types, not owned entities. Prefer complex types over owned entities for value objects and JSON.
- **SQL Server / Azure SQL**: `vector` type (`SqlVector<float>`, `EF.Functions.VectorDistance`) and the `json` data type; named default constraints (`HasDefaultValueSql(sql, "DF_Name")`, `UseNamedDefaultConstraints()`).
- **Split queries** now order the inner subquery consistently, fixing a class of wrong-data bugs with `AsSplitQuery()` + `Take`.
- **Security**: inlined constants are redacted (`?`) in SQL logs unless `EnableSensitiveDataLogging()`; an analyzer warns on string concatenation inside `FromSqlRaw` and other raw SQL APIs.

## Behavior changes to check after upgrading

| Change | Impact | Mitigation |
|---|---|---|
| Parameterized collections (`ids.Contains(x.Id)`) become `IN (@ids1, @ids2, ...)`, padded to reduce SQL variants, instead of one JSON parameter | Better estimates; large lists can regress or hit parameter limits | `UseParameterizedCollectionMode(ParameterTranslationMode.Parameter)` globally, or `EF.Parameter(ids).Contains(...)` per query; `ParameterTranslationMode.Constant` / `EF.Constant(ids)` to inline |
| `dotnet ef` on multi-targeted projects needs `--framework` | Tool commands fail without it | `dotnet ef migrations add X --framework net10.0` |
| SQL Server: `Application Name` with EF and SqlClient versions injected into connection strings that lack one | Separate connection pools from non-EF code (Dapper) on the same string; possible distributed-transaction escalation in `TransactionScope`; version strings visible to the server | Set `Application Name` yourself, without version information |
| Azure SQL (`UseAzureSql`) or compatibility level 170+: JSON columns map to `json` instead of `nvarchar(max)` | Next migration alters columns; `DISTINCT` over JSON arrays fails | `UseCompatibilityLevel(160)` or `HasColumnType("nvarchar(max)")` per property |
| Complex type column names uniquified, nested complex properties use the full path (`Complex_Nested_Property`) | Migration renames columns | `HasColumnName(...)` to keep old names |
| Migrations no longer share one transaction across all pending migrations (EF 9 behavior reverted) | Partial application possible if a later migration fails | Keep each migration self-contained and idempotent where possible |
| Microsoft.Data.Sqlite: timestamps without an offset read as UTC; `DateTimeOffset` into REAL columns written as UTC; `GetDateTime` on offset values returns UTC | Shifted times in SQLite apps | Review date handling; temporary switch `AppContext.SetSwitch("Microsoft.Data.Sqlite.Pre10TimeZoneHandling", true)` |
| `IDiscriminatorPropertySetConvention` and `IRelationalCommandDiagnosticsLogger` signatures changed | Custom conventions and loggers don't compile | Update signatures (loggers get a redacted `logCommandText`) |

Sources: Microsoft Learn "What's new in EF Core 10" and "Breaking changes in EF Core 10".
