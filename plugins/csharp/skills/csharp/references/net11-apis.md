# .NET 11 APIs: Process and System.Text.Json

Adapted from the upstream `process-api-net11` and `system-text-json-net11` skills (dotnet/skills).

.NET 11 is in preview until its GA (planned for November 2026); these API shapes can still change. Use them only when the project targets `net11.0` or later, and check the API docs for the installed SDK if a signature doesn't compile. For anything older, use the pre-.NET 11 patterns noted below.

## Process

New statics on `System.Diagnostics.Process` remove the classic deadlock of reading one redirected stream while the child blocks on the other.

| API | Does |
| --- | --- |
| `Process.Run(file, args, silent: false, timeout)` / `RunAsync(..., cancellationToken)` | Start, wait, return `ProcessExitStatus` (`ExitCode`, `Canceled`, `Signal`). `silent: true` discards output. Kills the child on timeout or cancellation |
| `Process.RunAndCaptureText(file, args, timeout)` / `RunAndCaptureTextAsync` | Same, returning `ProcessTextOutput` (`ExitStatus`, `StandardOutput`, `StandardError`, `ProcessId`) |
| `Process.StartAndForget(file, args)` | Start, return the PID, release handles; unredirected standard handles go to the null device. Throws if any `Redirect*` or `UseShellExecute` is set |
| `process.ReadAllText()` / `ReadAllBytes()` / `ReadAllLines()` (and `Async`) | Read stdout and stderr together without deadlock; needs both `RedirectStandardOutput` and `RedirectStandardError` |
| `ProcessStartInfo.KillOnParentExit` | Child dies when the parent exits, even on a crash. Windows, Linux and Android; guard with `OperatingSystem.IsX()` and fail explicitly elsewhere if teardown is required |
| `ProcessStartInfo.InheritedHandles` | Exact list of extra handles the child inherits (`SafeFileHandle`, `SafePipeHandle`); empty list means only standard handles. Don't share one handle across concurrent starts |
| `ProcessStartInfo.StartDetached` | Detach from the parent's terminal or session so the child survives the parent |

The `ProcessStartInfo` overloads of the capture APIs need `RedirectStandardOutput = true` and `RedirectStandardError = true` set by the caller. All of these need `UseShellExecute = false` (the default on .NET).

```csharp
ProcessTextOutput r = Process.RunAndCaptureText("git", ["status", "--porcelain"], timeout: TimeSpan.FromSeconds(30));
if (r.ExitStatus.ExitCode != 0)
    throw new InvalidOperationException($"git failed: {r.StandardError}");

await foreach (ProcessOutputLine line in process.ReadAllLinesAsync(ct))
    Console.WriteLine($"{(line.StandardError ? "err" : "out")}: {line.Content}");
```

Interpret `ExitCode` by the command's own contract. `Process.Dispose` never kills a process. Pass arguments as a list (`ArgumentList` or the `IEnumerable<string>` overloads), never a concatenated string built from user input.

Before .NET 11: `ProcessStartInfo` with `ArgumentList`, both streams redirected, then read both concurrently (`var o = p.StandardOutput.ReadToEndAsync(ct); var e = p.StandardError.ReadToEndAsync(ct); await p.WaitForExitAsync(ct);`), and `p.Kill(entireProcessTree: true)` on timeout.

## System.Text.Json

| Need | On `net11.0` | Instead of |
| --- | --- | --- |
| PascalCase property names | `PropertyNamingPolicy = JsonNamingPolicy.PascalCase` | A custom `JsonNamingPolicy` subclass or `[JsonPropertyName]` on every member |
| PascalCase dictionary keys | `DictionaryKeyPolicy = JsonNamingPolicy.PascalCase` (separate from the property policy) | Pre-transforming keys |
| Typed metadata | `JsonTypeInfo<T> ti = options.GetTypeInfo<T>();` | `(JsonTypeInfo<T>)options.GetTypeInfo(typeof(T))` |
| Probe whether metadata resolves | `if (options.TryGetTypeInfo<T>(out var ti)) { ... }` | `try`/`catch` around `GetTypeInfo` |

`GetTypeInfo<T>()` needs a resolver on the options: `TypeInfoResolver = new DefaultJsonTypeInfoResolver()` for reflection, or a source-generated `JsonSerializerContext` for trimmed or AOT apps; otherwise it throws `NotSupportedException`. File-based apps disable reflection-based serialization by default (see [file-based-apps.md](file-based-apps.md)), so set a resolver there too.

```csharp
var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.PascalCase,
    TypeInfoResolver = new DefaultJsonTypeInfoResolver(),
};
JsonTypeInfo<Person> ti = options.GetTypeInfo<Person>();
Console.WriteLine(JsonSerializer.Serialize(new Person("Jane", 30), ti)); // {"Name":"Jane","Age":30}

record Person(string name, int age);
```

Validate by running the code on a `net11.0` target. If no .NET 11 SDK is installed, install one locally ([sdk-setup.md](sdk-setup.md)) or report that it was not run; don't retarget to `net10.0` and call it verified.
