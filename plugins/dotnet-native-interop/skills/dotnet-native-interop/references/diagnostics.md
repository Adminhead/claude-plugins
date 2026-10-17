# Interop diagnostics

Read this when debugging a native-boundary failure or reviewing interop code for latent bugs.

## Symptom to cause

| Symptom | Likely cause | Check |
|---|---|---|
| `DllNotFoundException` | Library or one of its own dependencies not found, or wrong architecture | Test with `NativeLibrary.TryLoad("<path>", out _)`. Linux: `ldd libmylib.so` for missing deps, `LD_DEBUG=libs dotnet run` for the search; macOS: `otool -L`; Windows: a dependency walker such as `dumpbin /dependents`. Confirm the process bitness matches the library |
| `EntryPointNotFoundException` | Export name mismatch | `nm -D --defined-only libmylib.so` (Linux), `nm -gU` (macOS), `dumpbin /exports` (Windows). C++ without `extern "C"` mangles names. Set `EntryPoint` |
| `AccessViolationException` or a native crash | Signature mismatch, use after free, unpinned buffer, collected callback delegate | Compare signatures field by field; check struct sizes; check ownership and pinning; check callbacks are rooted |
| Silent data corruption | Wrong type size (`long`, `size_t`, `bool`), packing, or encoding | Compare `Marshal.SizeOf<T>()` and `Marshal.OffsetOf<T>()` against C `sizeof`/`offsetof`; test with known input and output |
| Intermittent crash after a GC | GC moved an unpinned object or collected a delegate | Root delegates; pin with `GCHandle` or use unmanaged memory for pointers native code keeps; force `GC.Collect()` in a test to reproduce |
| Crash or corruption on free | Mismatched allocator | Free with the library's function; never mix `malloc`/`free` with `CoTaskMem*` or `FreeHGlobal` |
| Stale or wrong error code | Missing `SetLastPInvokeError`, or another call in between | Set it on the declaration; read the error immediately |
| Works on x64, breaks on Windows x86 | Calling convention | Add `Cdecl`/`StdCall` per the header |

## Review pitfalls

| Pitfall | Fix |
|---|---|
| `int` or `ulong` for `size_t` | `nuint` |
| `long` for C `long` | `CLong`/`CULong` (+ `DisableRuntimeMarshalling` with `LibraryImport`) |
| `bool` without `MarshalAs` | `UnmanagedType.Bool` (4 bytes) or `U1` (1 byte) |
| Implicit string encoding | `StringMarshalling` / `CharSet.Unicode` / `LPUTF8Str` |
| Raw `IntPtr` handle in the public API | `SafeHandle` subclass |
| Struct packing mismatch | Match `Pack` to `#pragma pack` |
| Managed object passed as `void*` | Pin, or copy to unmanaged memory |

## Debugging approach

1. Reproduce with a minimal console app that calls only the failing function.
2. Debug with mixed-mode (native and managed) debugging: Visual Studio "Enable native code debugging", or `lldb` with the SOS extension on Linux and macOS (`dotnet tool install -g dotnet-sos`, then `dotnet-sos install`).
3. Assert struct sizes and offsets in a unit test for every struct crossing the boundary.
4. Run the native library under AddressSanitizer or Valgrind with a C test harness when corruption may be on the native side.
5. Post-mortem dumps of crashed processes: see the `dotnet-diagnostics` plugin.
6. .NET Framework only: Managed Debugging Assistants `pInvokeStackImbalance` and `invalidOverlappedToPinvoke` catch calling-convention and pinning bugs.

## Docs

- P/Invoke: https://learn.microsoft.com/dotnet/standard/native-interop/pinvoke
- LibraryImport source generation: https://learn.microsoft.com/dotnet/standard/native-interop/pinvoke-source-generation
- Type marshalling: https://learn.microsoft.com/dotnet/standard/native-interop/type-marshalling
- Disabled runtime marshalling: https://learn.microsoft.com/dotnet/standard/native-interop/disabled-marshalling
- Native library loading: https://learn.microsoft.com/dotnet/standard/native-interop/native-library-loading
- Best practices: https://learn.microsoft.com/dotnet/standard/native-interop/best-practices
