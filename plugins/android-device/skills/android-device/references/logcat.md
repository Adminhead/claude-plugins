# Logcat and crash evidence

Contents: buffers, filters, Java crashes, native crashes, process death.

## Buffers

| Buffer | Holds | Use |
| :- | :- | :- |
| `main` | app logs | default |
| `crash` | uncaught exceptions and native crash summaries | first stop after a crash |
| `system` | system services | process kills, lifecycle |
| `events` | binary event log | `am_crash`, `am_proc_died`, `am_anr` |

`adb -s <serial> logcat -b crash -d` dumps the crash buffer and exits. `-b all` reads every buffer. `-t 300` limits to the last 300 lines; `-v threadtime` adds timestamps, PID and TID.

## Filters

- `--pid=<pid>` follows one process and dies with it. Get the PID from `adb -s <serial> shell pidof -s <appId>`.
- `*:E` shows errors and above. `MyTag:D *:S` shows one tag only.
- Pipe to `grep -n -A 30 'FATAL EXCEPTION'` to get the trace after the header.

## Java and Kotlin crashes

The header is `FATAL EXCEPTION: <thread>` then `Process: <appId>, PID: <n>`. Read downward through every `Caused by:`. The last one is the root; each has its own frames, with `... N more` meaning shared frames elided. Frames in `android.*`, `androidx.*`, `kotlinx.*` and `java.*` are framework; the first frame in the app's package is the one to quote.

Typical roots: `ClassNotFoundException` or `NoSuchMethodError` only in release (shrinking, see `android-build`); `SecurityException` for a missing permission; `IllegalStateException` from a lifecycle misuse; `NullPointerException` from a platform type.

## Native crashes

The crash buffer shows `Fatal signal 11 (SIGSEGV)`, a fault address and a `backtrace:` block. The full tombstone is in `/data/tombstones/` and needs root, so on a normal device use `adb -s <serial> shell dumpsys dropbox --print data_app_native_crash` or `adb -s <serial> bugreport`. Frames show `pc` offsets into a `.so`; symbolize with `llvm-symbolizer` or `ndk-stack` against the unstripped library from the same build. Quote the signal, the top app-library frame and the abort message if one is present.

## Process death without a crash

No entry in `crash` can mean the system killed the app. Look in `events` for `am_proc_died` and `am_kill`, and in `system` for `lowmemorykiller` or `ActivityManager: Killing`. Report the stated reason (`excessive resource use`, `bg anr`, `empty #17`) rather than calling it a crash.
