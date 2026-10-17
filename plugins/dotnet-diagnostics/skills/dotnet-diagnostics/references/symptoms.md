# Recipes by symptom

Contents: high CPU; memory growth; excessive GC; slow requests; hangs; networking failures; assembly loading; crashes.

Each recipe names what to collect per environment. Tool install and options are in the tool's own reference. "Linux 10+ root" means .NET 10+, root and a 6.4+ kernel, where `dotnet-trace collect-linux` works.

## High CPU

- Windows: `PerfView /nogui collect /MaxCollectSec:30 /BufferSizeMB:1024 /CircularMB:2048`. For a spike that comes and goes, stop on it: `/StopOnPerfCounter:"Processor:% Processor Time:_Total>80"` with `/CircularMB:4096`.
- Linux: `dotnet-trace collect -p <PID> --duration 00:00:00:30`. Linux 10+ root: `sudo dotnet-trace collect-linux -p <PID> --duration 00:00:00:30` (real on-CPU samples with native frames). Before .NET 10 with native frames needed: `perfcollect`.
- Containers without console: dotnet-monitor `/trace?pid=<PID>&profile=Cpu`.

## Memory growth or leak

- Two dumps, one early and one after clear growth, diffed (dumps.md). Don't wait for `OutOfMemoryException`.
- Plus a trace during growth to see what allocates: Linux `dotnet-trace collect -p <PID> --profile gc-verbose`; Linux 10+ root `collect-linux --profile gc-verbose`; Windows a PerfView trace.
- .NET Framework: two dumps with `procdump -ma` or Task Manager plus a PerfView trace.
- Without admin, two dumps show what grows but may not explain why; if they don't, reproduce where you can trace.
- If the managed heap is flat but RSS grows, the leak is native (interop, unmanaged buffers): `collect-linux` or `perfcollect` native stacks help; a managed heap diff won't.

## Excessive GC

Needs a trace; a dump can't show GC frequency or pauses.

- Windows: `PerfView collect /GCCollectOnly` (open GCStats).
- Linux: `dotnet-trace collect -p <PID> --profile gc-verbose` (or `gc-collect` for lowest overhead). Linux 10+ root: `collect-linux --profile gc-verbose`.
- Containers without console: dotnet-monitor `profile=GcCollect`.

## Slow requests

Needs a thread-time trace: where threads wait (locks, I/O, downstream calls). Use larger buffers. For ASP.NET Core add `Microsoft.AspNetCore.Hosting` and `Microsoft-AspNetCore-Server-Kestrel` for server-side request timing.

- Windows: `PerfView /ThreadTime collect /BufferSizeMB:1024 /CircularMB:2048 /Providers:*Microsoft.AspNetCore.Hosting,*Microsoft-AspNetCore-Server-Kestrel`. No stop trigger by default; let the user design one.
- Linux: `dotnet-trace collect -p <PID>` (thread-time sampling is in the defaults). With the ASP.NET Core providers, keep the defaults explicit: `--profile dotnet-common,dotnet-sampled-thread-time --providers Microsoft.AspNetCore.Hosting,Microsoft-AspNetCore-Server-Kestrel`.
- Linux 10+ root: `collect-linux --profile dotnet-common,cpu-sampling,thread-time --providers Microsoft.AspNetCore.Hosting,Microsoft-AspNetCore-Server-Kestrel`.
- Containers without console: dotnet-monitor `profile=Cpu,Http`.
- Check `dotnet.thread_pool.queue.length` in dotnet-counters first: a growing queue means starvation, usually sync-over-async.

## Hangs

1. Start with a thread-time trace (as for slow requests). It shows livelock (busy threads, no progress), thread pool starvation (queued work not running) and whether anything progresses at all.
2. If the trace doesn't explain it, suspect a true deadlock and take a dump (dumps.md).
3. In the dump: `clrstack -all`, `syncblk`, `threadpool`, `dumpasync` in `dotnet-dump analyze`, or SOS in WinDbg / lldb.

## Networking failures

HTTP 5xx from downstream, timeouts, refused connections, DNS or TLS failures, pool exhaustion: collect a thread-time trace and the `System.Net.*` providers together.

| Provider | Covers |
| --- | --- |
| `System.Net.Http` | Request start/stop with status code (`-1` means no response), `RequestFailed` with the exception message, `RequestLeftQueue` (time waiting for a pooled connection), connection open/close |
| `System.Net.NameResolution` | DNS lookups and durations |
| `System.Net.Security` | TLS handshakes |
| `System.Net.Sockets` | Socket connects |

- Windows modern .NET: `PerfView /ThreadTime collect /BufferSizeMB:1024 /CircularMB:2048 /Providers:*System.Net.Http,*System.Net.NameResolution,*System.Net.Security,*System.Net.Sockets`. .NET Framework: `/ThreadTime` alone already has the `System.Net` events.
- Linux: `dotnet-trace collect -p <PID> --profile dotnet-common,dotnet-sampled-thread-time --providers System.Net.Http,System.Net.NameResolution,System.Net.Security,System.Net.Sockets`.
- Linux 10+ root: `collect-linux --profile dotnet-common,cpu-sampling,thread-time --providers System.Net.Http,System.Net.NameResolution,System.Net.Security,System.Net.Sockets`.
- Each provider adds overhead. If the failures are clearly HTTP status codes, `System.Net.Http` alone may do; add the others when the cause is unclear.

## Assembly loading

`FileNotFoundException`, `FileLoadException`, `ReflectionTypeLoadException`, version conflicts, duplicate loads across AssemblyLoadContexts: collect binder events (`Microsoft-Windows-DotNETRuntime:0x4:4`).

- Windows: a default `PerfView collect` already includes them; `/ClrEvents:Default-Profile` gives a smaller trace that keeps them. .NET Framework can also use `fuslogvw.exe`.
- Cross-platform: `dotnet-trace collect --clrevents assemblyloader -- ./myapp` launches the app under the tool, which catches failures at startup; `-p <PID>` attaches to a running one.
- Linux 10+ root: `collect-linux --clrevents assemblyloader`.

## Crashes

- Turn on automatic crash dumps (dumps.md, dumps-nativeaot.md, dumps-containers.md) with `DOTNET_EnableCrashReport=1` for a JSON summary, and wait for the next crash.
- A crash during a `dotnet-trace` session truncates the trace; open it with PerfView `/ContinueOnError`.
- Android and Apple crash logs: mobile-symbolication.md.
