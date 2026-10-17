# Testability seams for C#

Contents: when not to add a seam, choosing a seam, TimeProvider, file system, HTTP, custom wrappers, static APIs (ambient scope), keeping production wired, mechanical migrations, auditing a codebase.

## Don't add a seam when one exists

If the dependency already arrives through a constructor, parameter, property or DI (including a concrete injected `HttpClient`), write the test through that seam. Adding a second wrapper is the most common over-reach. Read the target code and its tests first; a single-class request doesn't need a repo-wide scan.

## Choose the smallest seam

| Dependency | Seam |
|---|---|
| Current time, delays, timers | Inject `TimeProvider`; `FakeTimeProvider` in tests |
| File system | Existing repo abstraction; else `System.IO.Abstractions` (`IFileSystem`); for one read or write, an injected delegate such as `Action<string, string>` with the real call as default |
| HTTP | Typed `HttpClient` from `IHttpClientFactory`; fake `HttpMessageHandler` in tests |
| Randomness | One value: inject `Func<int>`; several draws: inject `Random` or a small generator interface |
| `Guid.NewGuid()` | Inject `Func<Guid>` or a one-method provider |
| Culture | Pass `CultureInfo` or format options explicitly |
| Environment, console, process | One-purpose interface with only the members used; prefer operation shape (`Task<int> RunAsync(ProcessStartInfo, CancellationToken)`) over a wrapper that leaks `Process` lifecycle |

Constructor injection is the default for instance classes. Follow the repo's DI and naming conventions; don't add a DI container to a library that composes by hand.

Keep the public surface: when a class only has its implicit public parameterless constructor, keep that constructor as the real-dependency default and add the test constructor as `internal`, with `InternalsVisibleTo` for the exact test assembly (or the repo's existing friend-assembly convention). Don't add a public optional parameter just for tests.

## TimeProvider

Built into .NET 8+; package `Microsoft.Bcl.TimeProvider` for earlier .NET and .NET Framework. Fake: `Microsoft.Extensions.TimeProvider.Testing`.

```csharp
// Program.cs (only if the host has DI and nothing registers it yet)
builder.Services.AddSingleton(TimeProvider.System);

public sealed class OrderExpiry(TimeProvider time)
{
    public bool IsExpired(Order o) => time.GetUtcNow() > o.ExpiresAt;
}

// Manual composition: pass the real provider explicitly
var expiry = new OrderExpiry(TimeProvider.System);
```

```csharp
var fake = new FakeTimeProvider(new DateTimeOffset(2026, 1, 15, 0, 0, 0, TimeSpan.Zero));
var expiry = new OrderExpiry(fake);
fake.Advance(TimeSpan.FromDays(31));
Assert.True(expiry.IsExpired(order));
```

| Original | Replacement |
|---|---|
| `DateTime.UtcNow` | `time.GetUtcNow().UtcDateTime` |
| `DateTime.Now` | `time.GetLocalNow().LocalDateTime` |
| `DateTime.Today` | `time.GetLocalNow().LocalDateTime.Date` |
| `DateTimeOffset.UtcNow` | `time.GetUtcNow()` |
| `DateTimeOffset.Now` | `time.GetLocalNow()` |
| `Task.Delay(d, ct)` | `Task.Delay(d, time, ct)` |
| `new CancellationTokenSource(d)` | `new CancellationTokenSource(d, time)` |
| `new PeriodicTimer(p)` | `new PeriodicTimer(p, time)` (where the TFM has it) |

`.DateTime` on the offset gives `DateTimeKind.Unspecified`; use `.UtcDateTime` / `.LocalDateTime`. Keep a `DateTime` member `DateTime` during a mechanical change; switching it to `DateTimeOffset` is a design change.

Testing delays: start the operation, assert it is not complete, advance the fake to just before the deadline and assert again, advance across it, then await. Never `Thread.Sleep` or wait on real time.

## File system

```bash
dotnet add src/App package System.IO.Abstractions
dotnet add tests/App.Tests package System.IO.Abstractions.TestingHelpers
```

```csharp
builder.Services.AddSingleton<IFileSystem, FileSystem>();

public sealed class ConfigLoader(IFileSystem fs)
{
    public string Load(string path) => fs.File.ReadAllText(path);
}

var mock = new MockFileSystem(new Dictionary<string, MockFileData>
{
    ["/config.json"] = new MockFileData("""{"key":"value"}"""),
});
Assert.Equal("""{"key":"value"}""", new ConfigLoader(mock).Load("/config.json"));
```

Seed the mock before exercising the code, so the test can't pass without the read or write happening. Don't also write a custom file interface next to `IFileSystem`. Tests use no temp files or real disk.

## HTTP

```csharp
builder.Services.AddHttpClient<WeatherClient>(c => c.BaseAddress = new Uri("https://api.example.com"));

public sealed class WeatherClient(HttpClient http)
{
    public Task<Forecast?> GetAsync(string city, CancellationToken ct) =>
        http.GetFromJsonAsync<Forecast>($"forecast/{Uri.EscapeDataString(city)}", ct);
}

sealed class StubHandler(HttpStatusCode code, string body) : HttpMessageHandler
{
    public HttpRequestMessage? Last { get; private set; }
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        Last = req;
        return Task.FromResult(new HttpResponseMessage(code) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
    }
}
```

To test the DI registration itself, register the typed client in a `ServiceCollection`, replace its primary handler with `.ConfigurePrimaryHttpMessageHandler(() => stub)`, resolve the client and call it.

## Custom wrappers

```csharp
public interface IEnvironmentReader { string? Get(string name); }
public sealed class EnvironmentReader : IEnvironmentReader
{
    public string? Get(string name) => Environment.GetEnvironmentVariable(name);
}
builder.Services.AddSingleton<IEnvironmentReader, EnvironmentReader>();
```

Wrap only members the code calls; the default delegates straight to the static with no behavior change. Stateless wrappers are singletons. Don't mutate real environment variables in tests. Test both branches the static exposed (configured value and the `null` fallback).

## Static APIs that must stay static

When a public static class or released signature can't take a dependency, add a scoped ambient override:

```csharp
public static class Clock
{
    private static readonly AsyncLocal<TimeProvider?> s_override = new();
    private static TimeProvider Current => s_override.Value ?? TimeProvider.System;

    public static DateTime UtcNow => Current.GetUtcNow().UtcDateTime;

    internal static IDisposable Override(TimeProvider provider)
    {
        ArgumentNullException.ThrowIfNull(provider);
        var previous = s_override.Value;
        s_override.Value = provider;
        return new Scope(() => s_override.Value = previous);
    }

    private sealed class Scope(Action restore) : IDisposable
    {
        private Action? _restore = restore;
        public void Dispose() => Interlocked.Exchange(ref _restore, null)?.Invoke();
    }
}
```

Rules: `AsyncLocal<T>`, never `[ThreadStatic]` (it doesn't flow across `await`); dispose restores the previous value, never `null`; store the provider itself, not a mutable stack; give each parallel flow its own fresh fake. An `internal` override needs `InternalsVisibleTo` for the test assembly. Required tests: substitution, nested scopes restoring the outer value (also after an exception if asked), and two overlapping async flows each seeing only their own override. Don't convert the class to non-static as an alternative unless the user asks.

## Keep production wired

Update every composition root and manual `new` call affected by the new constructor. Build the production project before writing tests: a compile failure there is a seam problem, not a test problem.

## Mechanical migrations (a named static to a named abstraction)

- If the target abstraction or package is absent and the user only authorized call-site edits, stop and say what's missing.
- Lock the exact member set and inventory every call site (`file:line`) before editing. Replace exactly those, nothing adjacent; list deliberately untouched sites under "Remaining (out of scope)".
- One original read stays one replacement read, in place. Don't hoist two `DateTime.UtcNow` reads into a shared `now`; that changes behavior (offer it as a separate follow-up).
- Add the dependency the way the class already does (primary constructor or `private readonly` field matching naming).
- Afterwards, rerun the same search: zero hits in scope, untouched files unchanged. Update existing tests to supply fakes and keep asserting each branch the static exposed.

## Auditing a codebase for hidden dependencies

Search `.cs` files under the requested scope (exclude `bin/`, `obj/`, `*.Designer.cs`, generated code and test projects) for: `DateTime.Now|UtcNow|Today`, `DateTimeOffset.Now|UtcNow`, `Task.Delay(`, `File.`, `Directory.`, `new FileInfo(`, `new StreamReader(` with a path, `Environment.GetEnvironmentVariable|MachineName|CurrentDirectory|Exit`, `new HttpClient(`, `Console.Read|Write`, `Process.Start`, `new Random(`, `Random.Shared`, `Guid.NewGuid()`, `CultureInfo.CurrentCulture`.

- Treat matches as candidates. Check where the receiver comes from: injected collaborators aren't findings.
- Pure helpers (`Path.Combine`, `Path.GetExtension`, `Math.*`) are not blockers.
- Instance calls that hit a resource (`new FileInfo(p).LastWriteTimeUtc`) count; call them hidden dependencies, not statics.
- Build one ledger (category, pattern, `file:line`, recommended seam) and derive every total from it, so category, pattern and per-file counts reconcile. Keep files scanned, affected files and call sites as separate numbers.
- Two clock reads in one logical operation (`CreatedAt` and `ExpiresAt = DateTime.UtcNow.AddDays(30)`) are a consistency defect worth flagging.
- Scale the answer to the question: a "find time calls in X" request gets that category only.
