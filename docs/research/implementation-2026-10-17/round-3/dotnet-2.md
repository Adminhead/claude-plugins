# dotnet-2 report (Batch 2: tests and web)

## Plugins created

| Name | Type | Description (exactly as plugin.json) | Sources | Deps |
|---|---|---|---|---|
| dotnet-testing | skill (SKILL.md + 6 refs: run-and-filter, seams, mstest, xunit-nunit-tunit, test-projects, coverage; 4 evals) | Writes, runs and fixes .NET tests in xUnit, NUnit, MSTest and TUnit: dotnet test syntax for VSTest vs Microsoft.Testing.Platform, filters, TRX and dumps, test-project wiring, TimeProvider and file-system seams, coverage. Use for running tests in a .NET repo, a filter that matches nothing, "VSTest or MTP?", or testing DateTime.Now code. | dotnet/skills @ 10d85e2: dotnet-test run-tests, platform-detection, filter-syntax, mtp-hot-reload, testability-obstacle, detect-static-dependencies, generate-testability-wrappers, migrate-static-to-wrapper, writing-mstest-tests (+ref), scaffold-dotnet-test-project, coverage-analysis (+refs), crap-score; awesome-copilot csharp-tunit; ECC csharp-testing | none |
| aspnet-core | skill (SKILL.md + 3 refs: web-api, crud-scaffolding, middleware-and-auth; 4 evals) | Builds and reviews ASP.NET Core HTTP apps: minimal APIs and controllers, DTOs, validation, ProblemDetails, OpenAPI, middleware order, auth wiring, .http files, CRUD endpoints written without scaffolders. Use for Program.cs endpoint or middleware work, "add an endpoint", OpenAPI setup, or global error handling in a .NET web project. | dotnet/skills @ 10d85e2: dotnet-aspnetcore/dotnet-webapi, dotnet-data/create-datadriven-aspnetcore; middleware/auth ref written from Microsoft Learn | none |
| ef-core | skill (SKILL.md + 4 refs: query-fixes, migrations-and-lifetime, ef-core-10, dapper; 4 evals) | Writes, reviews and tunes EF Core data access: query shape, tracking, Include vs split queries, N+1, bulk ExecuteUpdate/Delete, DbContext lifetime, migrations, raw SQL parameters, and Dapper code beside it. Use for DbContext or LINQ-to-entities code, a slow EF query, dotnet ef migrations, or reviewing a repository or import job. | dotnet/skills @ 10d85e2: dotnet-data/optimizing-ef-core-queries, dotnet-upgrade/migrate-dotnet9-to-dotnet10/references/efcore-dotnet9to10.md; wshobson/agents dapper-patterns.md | none |

Each plugin has an MIT LICENSE (.NET Foundation and Contributors; plus GitHub, Inc. and Affaan Mustafa for dotnet-testing; Seth Hobson for ef-core) and a NOTICE with `Upstream: <url> @ <sha>` / `Paths:` lines (dotnet/skills 10d85e25fb42d5f65c568d5e979a005ee69eecb3, awesome-copilot cb64ad12e32737ae764becd6885462e9b4c7cb00, ECC 76aaa77df6adc5b889e689007bf99b9a4f74af34, wshobson/agents 044b4b21f083948e69ec878a7b07c8d0951a6ffa).

## Validation and tests

- `claude plugin validate --strict plugins/<name>`: passed for all three.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<name>/skills/<name>`: valid for all three.
- SKILL.md lengths: dotnet-testing 106, aspnet-core 63, ef-core 92 lines. Descriptions 337/333/330 chars.
- grep for codegraph, claude-mem, coding-core:, github:, "Efficient ", ALWAYS/MUST USE, ask_user, overlays, upstream skill names, omnisharp, .ps1: none outside NOTICE.
- Evals (4 per plugin: 3 trigger with a sibling not-fired grader, 1 hard negative) were written but NOT run (`claude plugin eval` not executed; costs model runs). No scripts or mod tests in these plugins.

## Deviations from the design and why

- dotnet-testing: no separate mtp-hot-reload reference; hot reload is a gotcha line in SKILL.md plus a section in run-and-filter.md. Coverage PowerShell scripts replaced by an inline Python Cobertura/CRAP snippet and bash ReportGenerator commands (local tool path). TUnit category uses `[Property("Category", ...)]` and `[MethodDataSource]` (awesome-copilot said `[MethodData]` and "tests within a class run sequentially", both wrong per TUnit docs). ECC's WebApplicationFactory sample used the EF InMemory provider; rewritten to Testcontainers with a real Postgres.
- aspnet-core: upstream's `.WithOpenApi()` advice removed (deprecated in .NET 10, ASPDEPR002). Exception handler rewritten to use `IProblemDetailsService` and domain exception types instead of mapping `ArgumentException`/`InvalidOperationException`. "Always put handlers in Middleware/" and "interface for every service" softened to follow the project's existing conventions. `dotnet ef database update` in the CRUD flow now requires a local dev DB or user approval.
- ef-core: four references instead of three (EF Core 10 notes kept as their own file, merging upstream efcore-dotnet9to10.md with the EF 10 what's-new page). Dapper reference rewritten: factory returns DbConnection (upstream's IDbConnection examples call OpenAsync/BeginTransactionAsync/QueryUnbufferedAsync which don't exist on IDbConnection), scoped IDbConnection and stale perf table dropped, string-built table names flagged, PostgreSQL ANY(@ids) and bulk-copy notes added. Compiled-query example uses EF.CompileAsyncQuery without a CancellationToken parameter.
- LSP is referred to generically as "the C# language server (csharp-ls)" per round-3 decision.

## Verified (Microsoft Learn / xunit.net / Context7, 2026-10-17)

- dotnet test modes: SDK 10 global.json `test.runner`, `--project/--solution/--test-modules`, `--` optional in MTP mode, bridge legacy and dropped by MTP v2 under SDK 10, MTP0001 warning, DOTNET_TEST_RUNNER from .NET 11 Preview 6, TestingPlatformCommandLineArguments for mixed solutions.
- xunit.v3 package variants (mtp-v1/v2/off), MTP v1 default in 3.x and v2 in 4.x, UseMicrosoftTestingPlatformRunner.
- MSTest v4 breaking changes (ThrowsException/ExpectedException removed, IsInstanceOfType return, ClassCleanupBehavior removed, .NET 8 minimum, MSTest.Sdk no longer adds Microsoft.NET.Test.Sdk under MTP).
- TUnit attribute names, hooks, default parallelism (Context7 /thomhurst/tunit). Testcontainers `new PostgreSqlBuilder(image)`.
- ASP.NET Core 10: AddValidation (assembly-scoped source generator, DisableValidation), OpenAPI 3.1 default, XML comments need GenerateDocumentationFile and named methods, WithOpenApi deprecation, cookie auth 401/403 for APIs, PipeReader JSON, IExceptionHandler diagnostics change; JsonSerializerOptions.AllowDuplicateProperties is .NET 10+.
- EF Core 10 what's new (named filters, LeftJoin, ExecuteUpdate lambda, complex types/JSON, parameterized collections, split-query ordering, log redaction, raw SQL concat analyzer, migrations no longer in one transaction).

## Unverified / TODO

- From memory, not rechecked this session: NUnit 4 details (`CancelAfter`, `Assert.EnterMultipleScope` availability by version, FixtureLifeCycle), xUnit v3 `Assert.SkipWhen`/`Explicit`/AssemblyFixture attribute names, MSTest 3.x minor-version gates (taken from upstream), EF 9 migration lock and PendingModelChangesWarning/MigrationsUserTransactionWarning behavior, UseSeeding/UseAsyncSeeding (EF 9), `has-pending-model-changes` (EF 8), HybridCache GetOrCreateAsync signature with tags, middleware-order specifics (UseOutputCache after UseCors, UseAntiforgery placement), SignalR sticky-session/SkipNegotiation note, Dapper QueryUnbufferedAsync signature (no token parameter; used WithCancellation).
- Evals not run; trigger accuracy against sibling .NET plugins (csharp, msbuild, nuget, blazor) untested because those plugins don't exist yet.

## Suggested follow-ups

- Run `claude plugin eval plugins/<name>` for the three plugins once registered; add hard negatives against `csharp` and `blazor` after batch 1/4 land.
- Coordinator: register in marketplace; add dotnet-testing to dotnet-meta deps; recommend-plugins evidence (Microsoft.NET.Sdk.Web -> aspnet-core, Microsoft.EntityFrameworkCore -> ef-core).
- test-run: reuse dotnet-testing's detection table for .NET support in detect.py (design follow-up).
- When dotnet-upgrade-guide lands, confirm its test-framework migration references match the MSTest 4 / xUnit v3 notes here.
