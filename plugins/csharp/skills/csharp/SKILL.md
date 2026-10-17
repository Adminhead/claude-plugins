---
name: csharp
description: Writes, reviews, refactors and debugs C# and .NET code (types, nullable references, async and cancellation, exceptions, DI, options and logging in the generic host, file-based apps). Use for work in *.cs or *.csx files, "review this C# class", CS86xx nullable warnings, a deadlock or sync-over-async bug, or a rename across a solution.
license: MIT
---

# C#

Keep the observable contract (public API, exceptions, nullability annotations, threading and cancellation behavior, serialized names) unless the request changes it.

Not for: MSBuild and build failures (`msbuild`), package versions (`nuget`), tests and `dotnet test` (`dotnet-testing`), TFM upgrades, SDK-style conversion and AOT readiness (`dotnet-upgrade-guide`), ASP.NET Core endpoints (`aspnet-core`), Blazor (`blazor`), EF Core (`ef-core`), hot-path tuning (`dotnet-performance`), analyzers and source generators (`roslyn-analyzers`).

## Orient

- Read `global.json`, `Directory.Build.props`/`.targets`, the project file (`TargetFramework(s)`, `LangVersion`, `Nullable`, `ImplicitUsings`, `TreatWarningsAsErrors`, `AnalysisLevel`), and `.editorconfig`. Run `dotnet --version` from the repo root.
- Use only language features the project's language version allows: the default follows the TFM (net8.0 is C# 12, net9.0 C# 13, net10.0 C# 14). Don't raise `LangVersion`, the TFM or the SDK unless asked. A multi-targeted project is limited by its oldest TFM; `netstandard2.0` and .NET Framework also lack newer BCL APIs.
- Find definitions, callers and implementations with codebase-memory when the repo is indexed (`search_graph`, `trace_path`, `get_code_snippet`), then the C# language server (csharp-ls) through the LSP tool, then Grep. Before changing a member, list its references; include every `partial` declaration and edit generator inputs, never `*.g.cs` output.
- For a library API, check the docs for the referenced version (Context7 `resolve-library-id` then `query-docs`, or Microsoft Learn).
- Use the repo's build and test commands when it documents them (README, `build.sh`, CI). Reproduce with the narrowest one.
- Read [references/sdk-setup.md](references/sdk-setup.md) when the required SDK isn't installed or `global.json` doesn't resolve.

## Types and APIs

- Least exposure: `private`, then `internal`, then `public`. Seal classes not designed for inheritance. Treat every public member as a compatibility promise.
- Add an interface only for a real second implementation or an external dependency a test must replace. Don't wrap existing abstractions.
- Records for DTOs and value-like data; `readonly record struct` for small values. Records give value equality, so don't put mutable collections or entities in them.
- `required` and `init` for objects that must be fully initialized; primary constructors for injected dependencies (their parameters are mutable captures, so assign to `readonly` fields when that matters).
- Collection expressions (`[]`, `[..a, ..b]`) and pattern matching (`is`, switch expressions, list patterns) where the language version allows. Return `IReadOnlyList<T>` or `IEnumerable<T>`, not `List<T>`, from public APIs.
- Follow the repo's naming and file layout; otherwise .NET conventions (PascalCase members, `_camelCase` private fields, `I` prefix on interfaces, `Async` suffix on async methods, file-scoped namespaces).
- When fixing one method, check its siblings for the same defect. Comments explain why, not what.

## Nullability

- With `<Nullable>enable</Nullable>`, a `?` on a reference type is a promise about null; the compiler doesn't enforce it at runtime. Keep `ArgumentNullException.ThrowIfNull(x)` (and `ArgumentException.ThrowIfNullOrWhiteSpace` for strings) on public entry points.
- A method that can return null returns `T?`. Never `return null!` or `default!` behind a non-nullable signature.
- Use `!` only where the value is provably non-null and the compiler can't see it, with a comment. Prefer `[NotNullWhen]`, `[MemberNotNull]` and similar attributes over `!` at every call site.
- Don't fix CS8602 by switching `x.M()` to `x?.M()`: that silently skips the call. Decide whether null is valid, then annotate or guard.
- Deserialized DTOs can hold null whatever the declared type; validate at the boundary.
- Read [references/nullable.md](references/nullable.md) when enabling nullable in a project, fixing CS86xx warnings in bulk, or annotating a library's public API.

## Async and cancellation

- Async all the way. Never block on async code (`.Result`, `.Wait()`, `.GetAwaiter().GetResult()`) in request, UI or library code; that is the classic deadlock and thread-pool starvation source. Avoid `async void` except event handlers.
- Accept a `CancellationToken` (last parameter, `cancellationToken = default` on public APIs) and pass it to every call that takes one, including `Task.Delay`. Check `ThrowIfCancellationRequested()` in long loops. Let `OperationCanceledException` propagate; don't log it as an error.
- Timeouts: `using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct); cts.CancelAfter(timeout);` and pass `cts.Token`. If you use `Task.WhenAny` for a timeout, cancel the loser.
- `ConfigureAwait(false)` in library code; omit it in apps (ASP.NET Core has no sync context, UI apps need theirs).
- Return the task directly instead of `async`/`await` only when there is no `using`, `try` or code after it.
- Default to `Task`/`Task<T>`. Use `ValueTask` only where measured to help, and await it exactly once.
- `await using` for `IAsyncDisposable`; implement it when the type owns async resources.
- No fire-and-forget: queue background work to a hosted service or `Channel<T>` so errors are observed and shutdown waits for it.
- HTTP: `IHttpClientFactory` or a long-lived `HttpClient`, never one per call. For large responses use `HttpCompletionOption.ResponseHeadersRead`, then stream (`ReadFromJsonAsync`, `JsonSerializer.DeserializeAsync`).
- Locks: never `await` inside `lock`; use `SemaphoreSlim.WaitAsync`. On .NET 9+, `System.Threading.Lock` for synchronous locks.
- Console apps: wire Ctrl+C to a `CancellationTokenSource`, and exit with 130 on cancellation.

## Errors

- Throw the most specific type (`ArgumentException`, `InvalidOperationException`, `KeyNotFoundException`, or a domain exception); never throw or catch bare `Exception` except at a top-level boundary that logs and maps it.
- Never swallow: log with context and rethrow (`throw;`, not `throw ex;`), or let it propagate. Use exception filters (`catch (HttpRequestException e) when (e.StatusCode == ...)`).
- Expected outcomes (validation failure, not found) can be return values (`TryX(out T)`, a result type) instead of exceptions, following the codebase's existing style.

## Generic host: DI, options, logging

- Lifetimes: singleton must not depend on scoped (captive dependency). Resolve scoped services from a singleton or hosted service with `IServiceScopeFactory.CreateScope()`. Keep `ValidateScopes` and `ValidateOnBuild` on in development.
- Options: bind with `services.AddOptions<T>().Bind(config.GetSection(...)).ValidateDataAnnotations().ValidateOnStart()`. Inject `IOptions<T>` (singleton, read once), `IOptionsSnapshot<T>` (scoped, recomputed per scope), or `IOptionsMonitor<T>` (singleton, change notifications) by need.
- Logging: message templates with named placeholders (`logger.LogInformation("Order {OrderId} shipped", id)`), never string interpolation. For hot paths use source-generated `[LoggerMessage]` partial methods. Never log secrets or personal data.
- Time and randomness: inject `TimeProvider` (.NET 8+) instead of `DateTime.Now`/`UtcNow`, so tests can use `FakeTimeProvider`.
- Config from environment and `appsettings.*.json`; secrets from user-secrets in development and a secret store in production, never committed.

## Verify

- `dotnet build -warnaserror` (or the repo's build) on the changed projects, and for every TFM of a multi-targeted project (`-f net8.0`), since a green default target hides breaks on another.
- The narrowest relevant tests (`dotnet-testing` has the filter syntax for VSTest versus Microsoft.Testing.Platform), then the wider suite when a shared or public surface changed.
- `dotnet format --verify-no-changes` when the repo enforces style. Fix analyzer findings (IDE/CA) the repo enables; suppress only with a justification attribute or `.editorconfig` entry, never wholesale.
- Report the exact commands and results, including any TFM or test you could not run.

## References

- [references/refactoring.md](references/refactoring.md) when renaming, moving, extracting, inlining or consolidating code, especially public, `partial`, multi-targeted or reflection-reached symbols.
- [references/nullable.md](references/nullable.md) for nullable migration and annotation rules, including EF Core and ASP.NET Core effects.
- [references/file-based-apps.md](references/file-based-apps.md) for `dotnet run app.cs`, `#:package`/`#:sdk` directives, and quick C# experiments without a project.
- [references/cli-apps.md](references/cli-apps.md) when building or changing a System.CommandLine (v2) CLI.
- [references/sdk-setup.md](references/sdk-setup.md) for installing an SDK into the repo without touching the system, and `global.json` pinning.
- [references/net11-apis.md](references/net11-apis.md) when the project targets `net11.0`: new `Process` and `System.Text.Json` APIs (preview until .NET 11 GA).

Adapted in part from [dotnet/skills](https://github.com/dotnet/skills) (MIT, .NET Foundation and Contributors) and [github/awesome-copilot](https://github.com/github/awesome-copilot) `CSharpExpert` and `system-commandline-cli` (MIT, GitHub, Inc.); see LICENSE and NOTICE at the plugin root.
