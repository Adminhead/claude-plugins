# dotnet-counters

First-look health check for modern .NET (counters are readable from .NET 5 onward). Cross-platform, no admin needed. Use it to decide whether the problem is CPU, GC, thread pool starvation, lock contention or exceptions before taking a trace or dump.

## Install

```bash
# .NET global tool (needs the SDK)
dotnet tool install --global dotnet-counters

# No SDK (containers): download, inspect, then run
curl -fsSL -o dotnet-counters https://aka.ms/dotnet-counters/linux-x64   # or linux-arm64, linux-musl-x64, linux-musl-arm64
file dotnet-counters        # expect an ELF executable, not HTML
chmod +x dotnet-counters
```

Windows builds are at `https://aka.ms/dotnet-counters/win-x64` (also `win-x86`, `win-arm64`). Match the target's bitness: a 32-bit process needs the x86 tool.

Installing a tool into a running production container changes that container: ask the user first.

## Commands

```bash
dotnet-counters ps                                   # list .NET processes and their PIDs

# Live view of the runtime counters, refreshed every 3 s
dotnet-counters monitor -p <PID> --refresh-interval 3 --counters System.Runtime

# ASP.NET Core request rate, duration and failures alongside the runtime
dotnet-counters monitor -p <PID> --counters System.Runtime,Microsoft.AspNetCore.Hosting

# Only selected instruments
dotnet-counters monitor -p <PID> --counters 'System.Runtime[dotnet.gc.collections,dotnet.gc.heap.total_allocated]'

# Record to a file for later comparison
dotnet-counters collect -p <PID> --refresh-interval 3 --format csv -o counters.csv

# Watch from process start
dotnet-counters monitor --counters System.Runtime -- ./myapp
```

## Reading the numbers

On .NET 9 and later, `System.Runtime` is a Meter with OpenTelemetry-style names; on .NET 8 and earlier the tool falls back to the older EventCounters with display names.

| Signal (.NET 9+ name) | Older counter | Suggests |
| --- | --- | --- |
| `dotnet.process.cpu.time` climbing fast | CPU Usage (%) high | CPU-bound: take a CPU / thread-time trace |
| `dotnet.gc.heap.total_allocated` rising steeply, many gen0 collections | Allocation Rate high | Allocation churn: trace with `gc-verbose` |
| `dotnet.gc.last_collection.heap.size` gen2 or loh growing without bound | Gen 2 Size / LOH Size growing | Leak: two dumps, diffed |
| `dotnet.gc.pause.time` high | % Time in GC high | Excessive GC: trace with `gc-verbose` |
| `dotnet.thread_pool.queue.length` > 0 and growing, thread count climbing | ThreadPool Queue Length | Thread pool starvation, often sync-over-async: thread-time trace |
| `dotnet.monitor.lock_contentions` rising fast | Monitor Lock Contention Count | Lock contention: thread-time trace |
| `dotnet.exceptions` rising | Exception Count | Exceptions as control flow or failing calls: trace with the `exception` keyword |

Same user (or root) and same `TMPDIR` as the target are required on Linux, as for every dotnet-* tool.
