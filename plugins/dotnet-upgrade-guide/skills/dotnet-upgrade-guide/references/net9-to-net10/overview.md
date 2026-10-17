# .NET 9 to .NET 10: hop checklist

Read at the start of the net9.0 -> net10.0 hop, after the TFM bump. The area files in this folder hold the details and fixes; load only the ones the project's technology needs (table at the end). Answer from these files rather than searching the web, except to check security advisories published since.

Contents: restore notes, source-incompatible checklist, behavioral checklist, infrastructure, smoke-test and security focus, area files.

## Restore notes

- Raise Microsoft packages to 10.0.x.
- NU1510: NuGet pruned a direct reference the shared framework now provides; remove the `PackageReference`.
- A `PackageReference` without a version is now an error; give it a version or use Central Package Management.
- `dotnet restore` audits transitive packages; review new vulnerability warnings rather than suppressing them.

## Source-incompatible checklist

1. `System.Linq.Async` conflicts with the built-in `System.Linq.AsyncEnumerable`: remove the package (or move to 7.0.0); when it arrives transitively add `<ExcludeAssets>compile</ExcludeAssets>`; rename `SelectAwait` to `Select` where needed.
2. Obsoletions: SYSLIB0058 (`SslStream.KeyExchangeAlgorithm`/`CipherAlgorithm`/`HashAlgorithm` -> `NegotiatedCipherSuite`; keep any weak-cipher rejection logic), SYSLIB0059 (`SystemEvents.EventsThreadShutdown` -> `AppDomain.ProcessExit`), SYSLIB0060 (`Rfc2898DeriveBytes` constructors -> `Rfc2898DeriveBytes.Pbkdf2`), SYSLIB0061 (`Queryable.MaxBy/MinBy` with `IComparer<TSource>` -> `IComparer<TKey>`), SYSLIB0062 (`XsltSettings.EnableScript`).
3. C# 14 `field` keyword in property accessors: a local named `field` is CS9272, a member named `field` used without `this.` is CS9258. Rename or write `@field`. `extension` is a contextual keyword too. See csharp-compiler.
4. C# 14 span overload resolution: in expression trees, array `.Contains()` may bind to `MemoryExtensions.Contains`, and `Enumerable.Reverse` on arrays may bind to the in-place span version. Cast to `IEnumerable<T>` or call `.AsEnumerable()`.
5. ASP.NET Core obsoletions: `WebHostBuilder`/`IWebHost`/`WebHost` (move to `WebApplication.CreateBuilder` or `Host.CreateDefaultBuilder`), `IActionContextAccessor`, `WithOpenApi`, `IncludeOpenAPIAnalyzers`, `IPNetwork` and `KnownNetworks`, Razor runtime compilation, `Microsoft.Extensions.ApiDescription.Client`. `Microsoft.AspNetCore.OpenApi` 10 pulls in `Microsoft.OpenApi` 2.x: `OpenApiAny`/`OpenApiString` -> `JsonNode`, `OpenApiSecuritySchemeReference`, nullable collections, `OpenApiSchema.Nullable` removed (aspnet-core).
6. SDK: `dotnet new sln` writes `.slnx` (`--format sln` for the old format); file-based app directives reject double quotes; `dnx.ps1` removed; `project.json` unsupported.
7. EF Core: `ExecuteUpdateAsync` takes a regular lambda; `IDiscriminatorPropertySetConvention` and `IRelationalCommandDiagnosticsLogger` signatures changed (efcore).
8. WinForms/WPF: disambiguate `MenuItem`/`ContextMenu` when both are referenced; `HtmlElement.InsertAdjacentElement` parameter renamed; empty `ColumnDefinitions`/`RowDefinitions` disallowed in WPF.
9. Cryptography: `MLDsa`/`SlhDsa` `SecretKey` members renamed `PrivateKey`; `CoseSigner.Key`, `X509Certificate.GetKeyAlgorithmParameters()` and `PublicKey.EncodedParameters` can be null; `CLR_OPENSSL_VERSION_OVERRIDE` -> `DOTNET_OPENSSL_VERSION_OVERRIDE`.

## Behavioral checklist

High impact first:

1. The runtime no longer installs a default SIGTERM handler. Generic Host and ASP.NET Core apps are unaffected; console or container apps without the host that rely on `ProcessExit` at SIGTERM need `PosixSignalRegistration.Create(PosixSignal.SIGTERM, _ => Environment.Exit(0))`.
2. `BackgroundService.ExecuteAsync` runs entirely on a background thread; code before the first `await` no longer blocks startup. Move ordering-sensitive work to `StartAsync` or use `IHostedLifecycleService` (extensions-hosting).
3. Configuration keeps JSON `null` values instead of converting them to empty strings, so bound properties with defaults become `null`.
4. Microsoft.Data.Sqlite `DateTimeOffset`: values without an offset are read as UTC, REAL columns store UTC, `GetDateTime` with an offset returns UTC. Temporary switch: `Microsoft.Data.Sqlite.Pre10TimeZoneHandling`.
5. EF Core translates `.Contains()` on parameter collections into multiple scalar parameters (revert with `UseParameterizedCollectionMode(ParameterTranslationMode.Parameter)`); Azure SQL and compatibility level 170+ map JSON to the `json` type and generate a migration (efcore).
6. System.Text.Json throws for polymorphic types whose properties clash with `$type`, `$id` or `$ref`; add `[JsonIgnore]`.

Also review: `BufferedStream.WriteByte` no longer flushes; W3C trace context is the default propagator; `DriveInfo.DriveFormat` reports Linux filesystem names; stricter LDAP `DirectoryControl` parsing; single-file apps and `DllImportSearchPath.AssemblyDirectory` no longer probe the executable directory for native libraries; `MailAddress` rejects consecutive dots; `Uri` length limits removed (add your own check if `Uri` was a size gate); cookie auth no longer redirects known API endpoints; `XmlSerializer` serializes `[Obsolete]` properties (add `[XmlIgnore]` to sensitive ones); `dotnet watch` and other CLI output moved to stderr; WinForms `StatusStrip` render mode, `TreeView` checkbox images; WPF `DynamicResource` misuse crashes.

## Infrastructure

- Docker: `sdk:10.0`, `aspnet:10.0`. Default tags are now Ubuntu-based and Debian images are no longer published; check `apt` package names and any Debian-specific steps.
- `global.json`: `"version": "10.0.100"` (keep the existing `rollForward` and other keys).
- Environment variables: `DOTNET_OPENSSL_VERSION_OVERRIDE` and `DOTNET_ICU_VERSION_OVERRIDE` replace the old names; `NUGET_ENABLE_ENHANCED_HTTP_RETRY` is gone.
- OpenSSL 1.1.1+ is required on Unix; OpenSSL primitives are no longer supported on macOS.
- Scripts calling `dotnet new sln` get `.slnx` unless they pass `--format sln`.

## Smoke-test and security focus

Graceful shutdown on SIGTERM, background service startup order, configuration binding with nulls, Sqlite dates, polymorphic JSON, EF `.Contains()` queries. Security: TLS cipher checks survived the SYSLIB0058 change; sensitive obsolete properties stay out of serialized output; oversized URIs are still rejected where that mattered; restore audit findings are fixed, not suppressed.

## Area files

| Area | Load when |
|---|---|
| [csharp-compiler.md](csharp-compiler.md), [core-libraries.md](core-libraries.md), [sdk-msbuild.md](sdk-msbuild.md) | Always |
| [aspnet-core.md](aspnet-core.md) | `Microsoft.NET.Sdk.Web` |
| [efcore.md](efcore.md) | EF Core or Microsoft.Data.Sqlite |
| [cryptography.md](cryptography.md) | `System.Security.Cryptography`, X.509 |
| [extensions-hosting.md](extensions-hosting.md) | Generic Host, `BackgroundService`, configuration |
| [serialization-networking.md](serialization-networking.md) | System.Text.Json, XmlSerializer, HttpClient, `MailAddress`, `Uri` |
| [winforms-wpf.md](winforms-wpf.md) | `UseWindowsForms` / `UseWPF` |
| [containers-interop.md](containers-interop.md) | Dockerfiles, single-file publish, P/Invoke |
