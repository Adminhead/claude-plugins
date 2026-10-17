# PerfView

Contents: install; common commands; triggers for long repros; Windows containers.

ETW tracing on Windows: the richest data for both .NET Framework and modern .NET. Requires admin. PerfView is Windows-only, so the commands here are for a Windows prompt.

## Install

Download `PerfView.exe` from https://github.com/microsoft/perfview/releases (a single executable, no installer). Check the file's Authenticode signature (right-click, Properties, Digital Signatures, or `Get-AuthenticodeSignature .\PerfView.exe`) before running it elevated.

## Common commands

Use `/BufferSizeMB:1024 /CircularMB:2048` on short traces so events are not dropped. Add `/nogui` to run from a script, `/MaxCollectSec:N` to stop on time.

```powershell
PerfView /nogui collect /MaxCollectSec:30 /BufferSizeMB:1024 /CircularMB:2048            # CPU, default providers
PerfView /ThreadTime collect /BufferSizeMB:1024 /CircularMB:2048                          # slow requests, waits, blocking
PerfView collect /GCCollectOnly /BufferSizeMB:1024 /CircularMB:2048                       # GC events only
PerfView collect /ClrEvents:Default-Profile                                               # smaller trace that keeps binder events
PerfView /ThreadTime collect /BufferSizeMB:1024 /CircularMB:2048 /Providers:*Microsoft.AspNetCore.Hosting,*Microsoft-AspNetCore-Server-Kestrel
PerfView /ThreadTime collect /BufferSizeMB:1024 /CircularMB:2048 /Providers:*System.Net.Http,*System.Net.NameResolution,*System.Net.Security,*System.Net.Sockets
```

On .NET Framework, `/ThreadTime` already includes the `System.Net` ETW events; omit the `/Providers` list.

## Triggers for long repros

Pair a `/StopOn...` trigger with a circular buffer. The trigger must fire on the symptom you want to capture, not on recovery: the buffer keeps only the most recent data, so stopping on recovery loses the interesting window. PerfView rechecks the condition for a few seconds before it stops, so the surrounding context is kept. Use `/StartOn...` only when the start event is known to precede the stop event; when unsure, leave it out.

```powershell
PerfView collect /StopOnPerfCounter:"Processor:% Processor Time:_Total>80" /BufferSizeMB:2048 /CircularMB:4096
PerfView collect /StopOnGCEvent /BufferSizeMB:2048 /CircularMB:4096
PerfView collect /StopOnException:"System.TimeoutException" /BufferSizeMB:2048 /CircularMB:4096
PerfView collect /StartOnPerfCounter:"Processor:% Processor Time:_Total>50" /StopOnPerfCounter:"Processor:% Processor Time:_Total>90" /BufferSizeMB:2048 /CircularMB:4096
```

| Parameter | Meaning |
| --- | --- |
| `/StopOnPerfCounter:"Category:Counter:Instance>Threshold"` | Stop when a counter crosses a threshold |
| `/StartOnPerfCounter:...` | Start when a counter crosses a threshold |
| `/StopOnGCEvent` | Stop on a GC event |
| `/StopOnException:"Type"` | Stop when that exception type is thrown |
| `/BufferSizeMB:N` | In-memory buffer |
| `/CircularMB:N` | Keep only the last N MB on disk |

For slow requests, give the plain `/ThreadTime` command without a trigger and let the user design one for their case. For memory leaks, capture during growth rather than stopping on `OutOfMemoryException`.

## Windows containers

Most Windows containers, including Kubernetes on Windows, use process isolation.

Process isolation: collect on the host.

```powershell
PerfView collect /EnableEventsInContainers /MaxCollectSec:30 /BufferSizeMB:1024 /CircularMB:2048
```

The trace opens with full symbols on the host while the container still runs. To analyze on another machine, embed symbol information from inside the container before it stops. `PerfView.exe` does not run in many slim images; build `PerfViewCollect` from https://github.com/microsoft/perfview as a self-contained publish and copy it in (a change to a running container, so ask first):

```powershell
docker cp trace.etl.zip <container>:C:\trace.etl.zip
docker exec <container> C:\tools\PerfViewCollect.exe merge /ImageIDsOnly C:\trace.etl.zip
docker cp <container>:C:\trace.etl.zip .\trace-merged.etl.zip
```

Hyper-V isolation (less common): collect inside the container as on a normal machine.

## .NET Framework without admin

PerfView needs admin and there is no other trace tool for .NET Framework. High CPU, slow requests and excessive GC can't be investigated without admin; tell the user to get it. Hangs and leaks can still use dumps: `procdump -ma <PID>` (Sysinternals) or Task Manager, Details, right-click, "Create memory dump file".
