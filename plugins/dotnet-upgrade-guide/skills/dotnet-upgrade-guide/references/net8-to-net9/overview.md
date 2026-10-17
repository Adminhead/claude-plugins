# .NET 8 to .NET 9: hop checklist

Read at the start of the net8.0 -> net9.0 hop, after the TFM bump. The area files in this folder hold the details and fixes; load only the ones the project's technology needs (table at the end). Answer from these files rather than searching the web, except to check security advisories published since.

Contents: restore notes, source-incompatible checklist, behavioral checklist, infrastructure, smoke-test focus, area files.

## Restore notes

- Raise `Microsoft.Extensions.*`, `Microsoft.AspNetCore.*`, `Microsoft.EntityFrameworkCore.*` and other Microsoft packages to 9.0.x (in `Directory.Packages.props` under Central Package Management).
- Targeting `net9.0` needs Visual Studio 17.12 or later on Windows.
- New warnings for netstandard1.x and net7.0 targets: consider dropping those TFMs.

## Source-incompatible checklist

1. `params ReadOnlySpan<T>` overloads (`String.Join`, `String.Concat`, `Path.Combine`, `Task.WhenAll` and more) now bind first; calls inside `Expression` lambdas fail (CS8640/CS9226). See core-libraries.
2. `StringValues` arguments to those methods become ambiguous; cast explicitly. See core-libraries.
3. Obsoletions: SYSLIB0054 (`Thread.VolatileRead/Write` -> `Volatile.Read/Write`), SYSLIB0057 (`X509Certificate2` binary/file constructors -> `X509CertificateLoader`), SYSLIB0055, SYSLIB0056.
4. C# 13: `[InlineArray]` on a `record struct` is an error (CS9259); iterators introduce a safe context, so local functions in iterators inside `unsafe` types need their own `unsafe`; empty collection expressions no longer tie-break on span vs non-span. See csharp-compiler.
5. `String.Trim/TrimStart/TrimEnd(ReadOnlySpan<char>)` existed only in previews; code built against previews must rebuild.
6. `BinaryFormatter` always throws. Stop and ask the user how to replace it before going further (serialization-networking).
7. `HttpListenerRequest.UserAgent` is now `string?`.
8. WinForms: nullability annotation changes and the WFO1000 serialization analyzers (winforms-wpf).

## Behavioral checklist

High impact first:

1. Float/double to integer conversions saturate on x86/x64 instead of wrapping (deployment-runtime).
2. EF Core: `Migrate()` throws when the model has pending changes. Look for `DateTime.Now`, `DateTime.UtcNow` or `Guid.NewGuid()` inside `HasData` and replace them with constants. `Migrate()` inside a user transaction also throws (efcore).
3. `IHttpClientFactory` uses `SocketsHttpHandler` by default, so casting the primary handler to `HttpClientHandler` throws `InvalidCastException`; header values in Trace logs are redacted (serialization-networking).
4. Environment variables now override `runtimeconfig.json` settings (deployment-runtime).
5. `HostBuilder` enables `ValidateOnBuild`/`ValidateScopes` in Development (aspnet-core).
6. `FromKeyedServicesAttribute` no longer falls back to a non-keyed service; it throws.
7. Container images no longer include zlib; Intel CET is on by default, so non-CET native libraries can terminate the process.

Also review: `BigInteger` length cap; `JsonDocument` deserialized from JSON `null` is a `JsonValueKind.Null` document, not C# `null`; System.Text.Json unescapes metadata property names; `ZipArchiveEntry` honors the UTF-8 flag; `IncrementingPollingCounter` first callback is async; `InMemoryDirectoryInfo` prepends rootDir; `RuntimeHelpers.GetSubArray` return type; HttpClient metrics always report `server.port`; URI query strings redacted in HttpClient logs; WinForms `PictureBox`, `StatusStrip` renderer, `IMsoComponent`; WPF `GetXmlNamespaceMaps` returns `Hashtable`.

## Infrastructure

- Docker: `sdk:8.0` -> `sdk:9.0`, `aspnet:8.0`/`runtime:8.0` -> `9.0`. Add `zlib1g` (or the distro's package) if the app needs system zlib.
- `global.json`: `"version": "9.0.100"` with a `rollForward` such as `latestFeature`; `disable` or `latestPatch` can block resolution.
- CI images and setup actions: install the 9.0 SDK.
- `dotnet build` uses the terminal logger in interactive terminals; scripts that parse console output need `--tl:off` or `MSBUILDTERMINALLOGGER=off`. `dotnet workload` output changed format. .NET Monitor image tags are version-only.

## Smoke-test focus

BinaryFormatter paths, float-to-int conversions, EF Core migrations at startup, HttpClient handler casts and logging, DI validation in Development, runtime settings set by environment variables.

## Area files

| Area | Load when |
|---|---|
| [csharp-compiler.md](csharp-compiler.md), [core-libraries.md](core-libraries.md), [sdk-msbuild.md](sdk-msbuild.md) | Always |
| [aspnet-core.md](aspnet-core.md) | `Microsoft.NET.Sdk.Web` |
| [efcore.md](efcore.md) | `Microsoft.EntityFrameworkCore.*` |
| [cryptography.md](cryptography.md) | `System.Security.Cryptography`, X.509 |
| [serialization-networking.md](serialization-networking.md) | BinaryFormatter, System.Text.Json, HttpClient, networking |
| [winforms-wpf.md](winforms-wpf.md) | `UseWindowsForms` / `UseWPF` |
| [containers-interop.md](containers-interop.md) | Dockerfiles, P/Invoke |
| [deployment-runtime.md](deployment-runtime.md) | runtimeconfig settings, deployment, float-to-int conversions |
