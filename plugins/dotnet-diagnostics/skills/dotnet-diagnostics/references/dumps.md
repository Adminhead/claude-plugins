# CoreCLR dumps

Contents: automatic crash dumps; on-demand dumps; verification; two-dump leak workflow.

| Need | Tool | Platforms |
| --- | --- | --- |
| Dump on crash | `DOTNET_DbgEnableMiniDump` env vars (the runtime runs `createdump`) | Linux, macOS, Windows |
| Dump of a running process | `dotnet-dump collect` | All |
| OS-level alternative | `gcore` (Linux, from gdb) | Linux |

Mobile platforms (Android, iOS) don't support these dumps; see mobile-symbolication.md for crash logs there.

## Automatic crash dumps

Setting these on a production service means a restart and new files on disk: get the user's go-ahead, and confirm the target directory exists and is writable by the app's user (the runtime won't create it).

```bash
export DOTNET_DbgEnableMiniDump=1
export DOTNET_DbgMiniDumpType=4                       # 1 Mini, 2 Heap (default), 3 Triage, 4 Full
export DOTNET_DbgMiniDumpName=/var/dumps/%e_%p_%t.dmp  # %p PID, %e exe name, %h host, %t epoch seconds, %% literal
export DOTNET_EnableCrashReport=1                     # adds <dump>.crashreport.json (not on Windows)
export DOTNET_CreateDumpDiagnostics=1                 # log why dump creation failed, if it does
# DOTNET_CreateDumpVerboseDiagnostics=1, DOTNET_CreateDumpLogToFile=/var/dumps/createdump.log for more detail
```

Windows (PowerShell, current session):

```powershell
$env:DOTNET_DbgEnableMiniDump = "1"
$env:DOTNET_DbgMiniDumpType = "4"
$env:DOTNET_DbgMiniDumpName = "C:\dumps\%e_%p_%t.dmp"
```

| Type | Contents | Use when |
| --- | --- | --- |
| 1 Mini | Modules, threads, exception, all stacks | Stacks only, small disk budget |
| 2 Heap | Mini plus heap and handles, no mapped images | Inspecting managed objects (the default) |
| 3 Triage | Mini with paths and other personal data removed | Sharing outside the team |
| 4 Full | All memory including module images | Maximum detail |

Single-file published apps support only Full (4), as NativeAOT does. Without `DOTNET_DbgMiniDumpName` the dump goes to `/tmp/coredump.<pid>`. The legacy `COMPlus_` prefix still works; use `DOTNET_`.

## On-demand dumps

Collecting a dump pauses the process while memory is written, and a Heap or Full dump pages in the process's memory, which can push a memory-limited container over its limit. Confirm with the user and check headroom before running this on production.

```bash
dotnet tool install --global dotnet-dump
# No SDK: download, inspect, then run
curl -fsSL -o dotnet-dump https://aka.ms/dotnet-dump/linux-x64   # or linux-arm64, linux-musl-x64, linux-musl-arm64; win-x64 for Windows
file dotnet-dump && chmod +x dotnet-dump

dotnet-dump ps                                              # find the PID
dotnet-dump collect -p <PID> --type Heap -o /var/dumps/myapp.dmp   # Full (default), Heap, Mini, Triage
dotnet-dump collect -p <PID> --crashreport                  # also write a crash report
```

`dotnet-dump` must run as the target's user (or root) and, on Linux and macOS, with the same `TMPDIR`. An x86 process needs the x86 tool.

Linux without dotnet-dump: `gcore -o /var/dumps/myapp <PID>` (writes `myapp.<PID>`; needs gdb and ptrace rights).

## Verify

```bash
env | grep -E 'DOTNET_(DbgEnableMiniDump|DbgMiniDump|EnableCrashReport)'
ls -ld /var/dumps          # exists and writable
ls -la /var/dumps          # after a crash: the .dmp and any .crashreport.json
```

Report the dump path and size to the user. When the investigation ends, remove the env vars so dumps don't pile up.

## Memory leak: two dumps

Take one dump early and one after significant growth, while memory is still rising; don't wait for `OutOfMemoryException`. Diff them in PerfView, or compare `dumpheap -stat` output from `dotnet-dump analyze` on each. Pair the dumps with a `gc-verbose` trace taken during growth to see what is allocating.

## Deadlock

Take a dump only after a thread-time trace fails to explain the hang (livelock and thread pool starvation show up in the trace). In the dump, `clrstack -all`, `syncblk` and `threadpool` in `dotnet-dump analyze` (or SOS in WinDbg or lldb) show the lock cycle.
