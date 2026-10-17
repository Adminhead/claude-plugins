# NativeAOT dumps

Contents: Linux core dumps; macOS; Windows WER and procdump; createdump alternative; verification.

NativeAOT apps are native executables and support only full dumps. OS core-dump mechanisms are the simplest route; `dotnet-dump` does not apply. Analyze with `lldb`/`gdb` (or WinDbg) and the app's own debug symbols from the publish output (`.dbg` / `.pdb` / `.dSYM`); keep them with each build.

| Need | Tool |
| --- | --- |
| Dump on crash (preferred) | OS core dumps: `ulimit -c` and `core_pattern` (Linux), `/cores` (macOS), WER (Windows) |
| Dump on crash (alternative) | `createdump` plus `DOTNET_DbgEnableMiniDump` |
| Dump of a running process | `gcore` (Linux), `lldb` (macOS), `procdump` (Windows) |

## Linux

`core_pattern` is system-wide and `ulimit` affects every process started from that shell: changing either on a shared or production host needs the user's go-ahead.

```bash
cat /proc/sys/kernel/core_pattern                 # check first; a leading | means a handler such as systemd-coredump
mkdir -p /var/dumps
ulimit -c unlimited                               # only for processes started from this shell afterwards
echo '/var/dumps/core.%e.%p.%t' | sudo tee /proc/sys/kernel/core_pattern
# persist: kernel.core_pattern = /var/dumps/core.%e.%p.%t in /etc/sysctl.d/
```

`core_pattern` specifiers: `%p` PID, `%e` executable name (first 15 characters), `%t` epoch time, `%h` hostname, `%u` UID.

With systemd-coredump already in place:

```bash
coredumpctl list myapp
coredumpctl info
coredumpctl dump myapp -o /var/dumps/myapp.core
```

Large processes may need `ProcessSizeMax=` and `ExternalSizeMax=` raised under `[Coredump]` in `/etc/systemd/coredump.conf`.

Running process: `gcore -o /var/dumps/myapp <PID>` (pauses the process while writing; ask first in production).

## macOS

```bash
ulimit -c unlimited
sudo mkdir -p /cores && sudo chmod 1777 /cores     # core files land in /cores/core.<pid>
lldb -p <PID> -o "process save-core /tmp/myapp.core" -o quit    # on demand; lldb ships with the Xcode command-line tools
```

If core dumps were not enabled before the crash, only the text report in `~/Library/Logs/DiagnosticReports/` (`.ips` or `.crash`) remains: stacks and crash reason, no memory.

## Windows

Windows Error Reporting writes local dumps for any process, including NativeAOT. Its `DumpType` values (0 Custom, 1 Mini, 2 Full) are separate from `DOTNET_DbgMiniDumpType`. This edits HKLM, so get the go-ahead and run in an elevated PowerShell:

```powershell
$key = "HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\myapp.exe"
New-Item -Path $key -Force | Out-Null
New-ItemProperty -Path $key -Name DumpFolder -Value "C:\dumps" -PropertyType ExpandString -Force
New-ItemProperty -Path $key -Name DumpCount -Value 10 -PropertyType DWord -Force
New-ItemProperty -Path $key -Name DumpType -Value 2 -PropertyType DWord -Force
New-Item -Path C:\dumps -ItemType Directory -Force | Out-Null
```

On demand, with Sysinternals procdump (download from https://learn.microsoft.com/sysinternals/downloads/procdump, check the signature with `Get-AuthenticodeSignature`, then run):

```powershell
procdump.exe -ma <PID> C:\dumps\myapp.dmp          # full dump now
procdump.exe -ma -e -w myapp.exe C:\dumps\          # wait for the process, dump on unhandled exception
```

Or Task Manager, Details, right-click the process, "Create memory dump file".

## Alternative: createdump

The env-var workflow from dumps.md also works for NativeAOT if `createdump` is available, with `DOTNET_DbgMiniDumpType=4`:

```bash
export DOTNET_DbgEnableMiniDump=1
export DOTNET_DbgMiniDumpType=4
export DOTNET_DbgMiniDumpName=/var/dumps/%e_%p_%t.dmp
```

Place `createdump` next to the app binary, copied from a runtime of the same major version:

```bash
cp /usr/share/dotnet/shared/Microsoft.NETCore.App/<version>/createdump ./publish/
# no runtime installed: take it from the runtime image
docker run --rm -v "$PWD/publish:/out" mcr.microsoft.com/dotnet/runtime:10.0 \
  sh -c 'cp /usr/share/dotnet/shared/Microsoft.NETCore.App/*/createdump /out/'
```

On .NET 11 and later (NativeAOT only), `DOTNET_DbgCreateDumpToolPath` names the directory that holds `createdump`, so it need not sit beside the binary: `export DOTNET_DbgCreateDumpToolPath=/opt/tools`.

## Verify

```bash
cat /proc/sys/kernel/core_pattern; ulimit -c      # Linux
coredumpctl list --no-pager | tail -5             # systemd hosts
ls -la ./createdump "${DOTNET_DbgCreateDumpToolPath:-.}/createdump" 2>/dev/null
ls -ld /var/dumps
```

Report the dump path and size; undo `core_pattern`, `ulimit` and WER changes when done if they were temporary.
