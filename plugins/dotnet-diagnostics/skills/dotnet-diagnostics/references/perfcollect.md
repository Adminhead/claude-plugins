# perfcollect

Contents: requirements; install; collect; options; Kubernetes sidecar; viewing.

A bash script around Linux `perf` (CPU samples with native stacks) and LTTng (runtime events). Use it on Linux before .NET 10, or wherever `dotnet-trace collect-linux` is unavailable, when native frames matter.

| Attribute | Value |
| --- | --- |
| OS | Linux only |
| Runtime | Modern .NET (not .NET Framework) |
| Root | Yes |
| Container | Needs `PERFMON` and `SYS_PTRACE` capabilities; add `SYS_ADMIN` if capture fails with those |

## Install (download, inspect, then run)

The script runs as root and installs packages, so read it before running it.

```bash
curl -fsSL -o perfcollect https://aka.ms/perfcollect
file perfcollect            # expect a shell script
less perfcollect            # read it before running it as root
chmod +x perfcollect
sudo ./perfcollect install  # installs perf and LTTng; ask the user before doing this on a production host
```

## Collect

Set these in the app's environment before it starts (a restart, so a production change):

```bash
export DOTNET_PerfMapEnabled=1      # JIT'd method names for perf
export DOTNET_EnableEventLog=1      # runtime events to LTTng
```

On .NET 7, also set `DOTNET_EnableWriteXorExecute=0`; set it on any version if stacks show `[unknown] /memfd:doublemapper` frames. The older `COMPlus_` prefix still works, but use `DOTNET_`.

```bash
sudo ./perfcollect collect mytrace                 # Ctrl+C to stop; writes mytrace.trace.zip
sudo ./perfcollect collect mytrace -collectsec 30  # fixed duration
```

LTTng 2.13 and later broke compatibility with the runtime's 2.12 support. On such distributions, add `-nolttng` and don't set `DOTNET_EnableEventLog`.

## Options

| Option | Use |
| --- | --- |
| `-threadtime` | Per-thread CPU time, for waits and blocking |
| `-gccollectonly` | Minimal GC events, lowest overhead (like PerfView `/GCCollectOnly`) |
| `-gconly` | More verbose GC events plus JIT, loader and exceptions |
| `-gcwithheap` | Heap survival and movement; can double GC times, avoid in production |

Native runtime symbols (`libcoreclr.so`) resolve only when the `.dbg` files sit beside the libraries; fetch them with `dotnet-symbol --symbols` (see dotnet-trace.md).

## Kubernetes: privileged diagnostics sidecar

Every change below edits the workload spec and restarts the pod. Present it to the user and get a go-ahead; remove the sidecar afterwards.

```yaml
spec:
  shareProcessNamespace: true          # sidecar sees the app's processes
  volumes:
  - name: shared-tmp
    emptyDir: {}                       # perf-<pid>.map files and logs live in /tmp
  containers:
  - name: app
    image: myapp:1.2.3
    env:
    - name: DOTNET_PerfMapEnabled
      value: "1"
    - name: DOTNET_EnableEventLog
      value: "1"
    volumeMounts:
    - name: shared-tmp
      mountPath: /tmp
  - name: diagnostics
    image: ubuntu:24.04
    command: ["/bin/sh", "-c", "sleep infinity"]
    securityContext:
      capabilities:
        add: ["PERFMON", "SYS_PTRACE"]   # fall back to privileged: true only if capture fails
    volumeMounts:
    - name: shared-tmp
      mountPath: /tmp
```

Then, inside the sidecar, download and inspect `perfcollect` as above, install, and collect:

```bash
kubectl exec -it <pod> -c diagnostics -- /bin/bash
# inside: curl -fsSL -o perfcollect https://aka.ms/perfcollect; less perfcollect; chmod +x perfcollect
./perfcollect install
./perfcollect collect mytrace -collectsec 30
exit
kubectl cp <pod>:mytrace.trace.zip ./mytrace.trace.zip -c diagnostics
```

For Docker: `docker run --cap-add PERFMON --cap-add SYS_PTRACE ...` (or `--privileged` as a last resort, never as a standing setting).

## Viewing

- On Windows: copy `mytrace.trace.zip` over and open it in PerfView (CPU Stacks, GCStats, JITStats, Events).
- On Linux: `./perfcollect view mytrace.trace.zip` (CPU via perf), or `-viewer lttng` for the events.
- EventSource events appear as `EventSourceEvent` under `Microsoft-Windows-DotNETRuntime`, with JSON payloads.
