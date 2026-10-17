# dotnet-trace

Contents: install; `collect` (any OS); `collect-linux` (.NET 10+, Linux); containers; output formats.

| Verb | OS | Runtime | Root | Stacks |
| --- | --- | --- | --- | --- |
| `collect` | Windows, Linux, macOS | .NET Core 3.0+ (launching a child process needs .NET 5+) | No | Managed only |
| `collect-linux` | Linux x64/Arm64, kernel 6.4+ with `CONFIG_USER_EVENTS=y`, glibc 2.27+ (not Alpine 3.22) | .NET 10+ | Yes (`CAP_PERFMON`/`CAP_SYS_ADMIN`) | Managed, native and kernel; machine-wide by default |

`dotnet-trace` does not work on .NET Framework; use PerfView there.

## Install

```bash
# .NET global tool (needs the SDK)
dotnet tool install --global dotnet-trace

# No SDK (containers): download, inspect, then run
curl -fsSL -o dotnet-trace https://aka.ms/dotnet-trace/linux-x64   # or linux-arm64, linux-musl-x64, linux-musl-arm64
file dotnet-trace           # expect an ELF executable, not HTML
chmod +x dotnet-trace
```

Windows: `https://aka.ms/dotnet-trace/win-x64` (also `win-x86`, `win-arm64`), saved as `dotnet-trace.exe`.

Copying or installing the tool into a running production container changes it: get the user's go-ahead first. Attaching to a live process is also a production change; say so before running `collect -p`.

## collect

```bash
dotnet-trace ps                                        # find the PID
dotnet-trace collect -p <PID>                          # defaults: dotnet-common + dotnet-sampled-thread-time
dotnet-trace collect -p <PID> --duration 00:00:00:30   # dd:hh:mm:ss
dotnet-trace collect -p <PID> --profile gc-verbose     # GC collections plus sampled allocations
dotnet-trace collect -p <PID> --profile gc-collect     # GC collections only, very low overhead
dotnet-trace collect -p <PID> --profile database       # ADO.NET and EF Core commands
dotnet-trace collect -p <PID> -o /tmp/trace.nettrace
dotnet-trace collect --clrevents assemblyloader -- ./myapp   # launch and trace from startup
dotnet-trace list-profiles
```

`--providers` and `--clrevents` replace the default profiles rather than adding to them, so name the profiles you still want:

```bash
dotnet-trace collect -p <PID> --profile dotnet-common,dotnet-sampled-thread-time \
  --providers System.Net.Http,System.Net.NameResolution,System.Net.Security,System.Net.Sockets
```

Provider syntax: `Name[:Keywords[:Level[:key=value;...]]]`, for example `Microsoft-Windows-DotNETRuntime:0x4:4` (assembly loader, informational). Put long provider lists in an `.rsp` file and run `dotnet-trace collect @args.rsp` to avoid shell quoting trouble.

Stopping a trace can take minutes on a large app while the runtime writes rundown data. If the app crashes mid-trace, the file lacks rundown; open it in PerfView with `/ContinueOnError`.

To trace from startup without launching under the tool (for example, to keep stdin), run `dotnet-trace collect --diagnostic-port myport.sock`, then start the app with `DOTNET_DiagnosticPorts=<full path printed by the tool>`. Launch the built app or `dotnet exec app.dll`, not `dotnet run`, which spawns other .NET processes that may connect first.

## collect-linux (.NET 10+)

A preview verb. It writes a newer `.nettrace` format that current PerfView reads; `convert` and `report` may not yet.

Check prerequisites first:

```bash
uname -r                                    # 6.4 or later
zgrep CONFIG_USER_EVENTS /proc/config.gz    # or: ls /sys/kernel/tracing/user_events_data
ldd --version                               # glibc 2.27 or later
dotnet-trace collect-linux --probe          # which .NET processes support it (no root needed)
```

```bash
sudo dotnet-trace collect-linux                          # all processes; defaults: dotnet-common + cpu-sampling
sudo dotnet-trace collect-linux -p <PID>                 # one process
sudo dotnet-trace collect-linux --duration 00:00:00:30 -o /tmp/trace.nettrace
sudo dotnet-trace collect-linux --profile thread-time    # kernel context switches: on/off-CPU, waits
sudo dotnet-trace collect-linux --profile gc-verbose
sudo dotnet-trace collect-linux --perf-events sched:sched_switch,sched:sched_wakeup
```

As with `collect`, adding `--providers` drops the defaults; name the profiles too, for example `--profile dotnet-common,cpu-sampling,thread-time --providers System.Net.Http`.

Native runtime frames resolve only if symbol files sit beside the libraries during capture:

```bash
dotnet tool install -g dotnet-symbol
dotnet-symbol --symbols -o ./syms /usr/share/dotnet/shared/Microsoft.NETCore.App/<version>/lib*.so
sudo cp ./syms/*.dbg /usr/share/dotnet/shared/Microsoft.NETCore.App/<version>/
```

It cannot trace processes in another PID namespace.

## Containers

```bash
# Inside the container (verify the PID; it is often 1)
dotnet-trace ps
dotnet-trace collect -p 1 -o /tmp/trace.nettrace

# Copy the trace out
kubectl cp <pod>:/tmp/trace.nettrace ./trace.nettrace
docker cp <container>:/tmp/trace.nettrace ./trace.nettrace
```

From outside the container, use `dotnet-monitor` as a sidecar (see dotnet-monitor.md) or an ephemeral `kubectl debug` container that shares the target's process namespace; both are cluster changes that need the user's go-ahead.

## Output formats

| `--format` | File | Open with |
| --- | --- | --- |
| `NetTrace` (default) | `.nettrace` | PerfView, Visual Studio, `dotnet-trace report <file> topN` |
| `Speedscope` | `.speedscope.json` | https://www.speedscope.app |
| `Chromium` | `.chromium.json` | Chrome DevTools performance panel |

`dotnet-trace convert <file> --format Speedscope` converts later and keeps the original.
