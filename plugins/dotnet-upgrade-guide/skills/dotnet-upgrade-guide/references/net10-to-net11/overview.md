# .NET 10 to .NET 11: hop checklist (prerelease)

Read at the start of the net10.0 -> net11.0 hop, after the TFM bump.

.NET 11 is prerelease until its GA in November 2026. RC 2 shipped on 2026-10-13 with a go-live license; earlier previews are not supported. Before starting, tell the user the target is prerelease and confirm they want it; for production work without go-live needs, staying on .NET 10 (LTS) is the default. Use the newest preview or RC SDK, pin it in `global.json` (for example `"version": "11.0.100-rc.2.xxxxx"` taken from `dotnet --list-sdks`), and expect changes until GA.

The area files in this folder describe changes through Preview 3 in detail. The section "Later previews and RCs" lists changes Microsoft documented after that; read the linked Learn page for the fix before acting on one, and recheck the [.NET 11 breaking changes list](https://learn.microsoft.com/dotnet/core/compatibility/11) since it keeps growing until GA.

Contents: source-incompatible checklist, behavioral checklist, later previews and RCs, infrastructure, smoke-test focus, area files.

## Source-incompatible checklist (through Preview 3)

1. C# 15: span-typed collection expressions get `declaration-block` safe-context, so assigning one to an outer-scope variable errors; use an array or move the expression. See csharp-compiler.
2. `ref readonly` delegates and local functions need `System.Runtime.InteropServices.InAttribute` available.
3. `nameof(this.P)` in attributes: write `nameof(P)`.
4. `with(...)` inside a collection expression is now constructor arguments; call a method named `with` as `@with(...)`.
5. Interface-typed left operand of `&&`/`||` with a `dynamic` right operand is a compile error; cast.
6. `(X.Y) when` in a switch expression arm parses as a constant pattern with a guard; review such arms.
7. EF Core Cosmos: sync I/O (`ToList()`, `SaveChanges()`) always throws; use async.
8. SYSLIB0063: the `NamedPipeClientStream` constructor with `bool isConnected` is obsolete; use the three-parameter overload (fails builds with `TreatWarningsAsErrors`).
9. `Microsoft.AspNetCore.OpenApi` depends on `Microsoft.OpenApi` 3.x; direct use of its types needs the v3 changes (aspnet-core).
10. `Microsoft.EntityFrameworkCore.Tools`/`.Tasks` no longer bring `.Design`; reference it explicitly. `EFOptimizeContext` is replaced by `EFScaffoldModelStage` and `EFPrecompileQueriesStage` (efcore).

## Behavioral checklist (through Preview 3)

1. `DeflateStream`/`GZipStream` write header and footer even for empty payloads.
2. `MemoryStream` maximum capacity and its exception changed.
3. TAR readers verify header checksums; `TarWriter` writes hard links as `HardLink` entries.
4. `ZipArchive` validates CRC32 on read (corrupt archives throw `InvalidDataException`); `ZipArchive.CreateAsync` loads entries eagerly.
5. `Environment.TickCount` follows Windows timeout behavior.
6. DSA throws on macOS; switch to RSA or ECDSA.
7. Japanese calendar minimum date corrected.
8. Minimum hardware: x86-64-v2 on x86/x64; LSE on Windows Arm64 (runtime-jit).
9. The Mono launch target is no longer set for .NET Framework apps.
10. Unhandled exceptions from `BackgroundService.ExecuteAsync` stop the host; catch inside services that must not take the app down.
11. Server-side client-certificate validation no longer downloads intermediates via AIA; install the full chain or have clients send it (cryptography).
12. Blazor `Virtualize` default `OverscanCount` is 15 (was 3).
13. Microsoft.Data.SqlClient 7.0 moves Entra ID auth to `Microsoft.Data.SqlClient.Extensions.Azure`; `SqlVector<T>` properties aren't loaded unless projected; SQLitePCLRaw 3.0 drops the encryption bundles.
14. NativeAOT native libraries on Unix get a `lib` prefix (`libMyLib.so`).

## Later previews and RCs

Documented on Learn after Preview 3 (titles as listed there; check each page for the fix):

- Core libraries: `Assembly.GetCallingAssembly` changes when stack trace support is disabled; `CborReader`/`CborWriter` default maximum nesting depth; `Complex` special values follow C23 Annex G; `DateOnly`/`TimeOnly` `TryParse` throw for invalid input; `decimal` and `BigInteger` floating-point conversions are correctly rounded; `Environment.GetCommandLineArgs()[0]` keeps the apphost invocation name; `Math.Round`/`MathF.Round` with digits return correctly rounded results; `NamedPipeServerStream` with `CurrentUserOnly` tightens Unix socket permissions; `Nullable.GetUnderlyingType` throws for custom `Type` subclasses; `PackagePart.GetStream()` is non-seekable for compressed parts in ReadWrite packages; `SafeFileHandle.IsAsync`/`FileStream.IsAsync` reflect non-blocking state on Unix; tensor shape alignment and storage layout validation; new obsoletions with non-default diagnostic IDs.
- Cryptography: further obsoletions; Composite ML-DSA on Windows and HKDF on Windows use native CNG; Linux AIA fetching limited to two fetches per chain build.
- Deployment: `configProperties` in `.runtimeconfig.dev.json` override `.runtimeconfig.json`.
- Extensions: `IHost.RunAsync`/`StopAsync` throw when a `BackgroundService` fails; `ChangeToken.OnChange` async overloads rebind Task-returning callbacks; `FileConfigurationProvider` reload and `OnLoadException` behavior for load and IO failures; options validation generator reports SYSLIB1205 for explicit `Validate` implementations; synchronous access to async-validated options throws; `PhysicalFilesWatcher` validates paths; some `Microsoft.Extensions` packages are now in the shared framework (expect NU1510 prunes).
- JIT: floating-point conversions to small integral types saturate.
- Networking: HttpClient high-cardinality metrics use observable counters.
- SDK and MSBuild: `dnx` scripts bypass `global.json` SDK selection; NativeAOT CLI command handling on by default; NU1703 for packages with deprecated MonoAndroid assets; `dotnet pack` warns (NU5052) on package IDs with restricted characters; restore no longer searches the global packages folder for a higher version; local container builds prefer platform-native runtimes; template engine packages dropped netstandard2.0; VSTest no longer depends on Newtonsoft.Json (test code that relied on it transitively needs a direct reference).

## Infrastructure

- Docker: `sdk:11.0`, `aspnet:11.0` tags for the prerelease (or the `11.0-preview`/`-rc` tags the registry offers).
- `global.json`: update `sdk.version` to the installed prerelease SDK and keep the other keys (`rollForward`, `test`, `msbuild-sdks`). Add `"allowPrerelease": true` if the policy needs it.
- Confirm deployment hardware meets x86-64-v2 / Arm64 LSE.

## Smoke-test focus

Empty-stream compression, TAR and ZIP reading, Cosmos operations, DSA on macOS, large `MemoryStream`s, span collection expressions, background service failures, mTLS chains, SQL Server with Entra ID, NativeAOT output names on Unix, and any rounding or parsing code touched by the later changes above.

## Area files

| Area | Load when |
|---|---|
| [csharp-compiler.md](csharp-compiler.md), [core-libraries.md](core-libraries.md), [sdk-msbuild.md](sdk-msbuild.md) | Always |
| [aspnet-core.md](aspnet-core.md) | ASP.NET Core (OpenAPI, Blazor) |
| [efcore.md](efcore.md) | EF Core |
| [cryptography.md](cryptography.md) | Cryptography, mTLS, macOS targets |
| [runtime-jit.md](runtime-jit.md) | Older hardware, embedded devices, NativeAOT |
