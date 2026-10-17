---
name: dotnet-native-interop
description: Writes, reviews and debugs .NET native interop with P/Invoke and LibraryImport, covering signatures from C headers, string and struct marshalling, memory ownership, SafeHandle, callbacks and library loading. Use for wrapping a C library, a DllNotFoundException or AccessViolationException at a native call, or moving DllImport to LibraryImport for AOT.
---

# .NET native interop

Interop bugs rarely fail at the faulty line. A wrong type size, encoding or allocator shows up later as an intermittent crash, corrupted data or an access violation somewhere else. Match the native contract exactly, then prove it with a round-trip test.

Not for: COM interop or C++/CLI; general C# work (`csharp`); trimming and AOT readiness across a whole app (`dotnet-upgrade-guide`); native crash dumps from production (`dotnet-diagnostics`); build and packaging of native assets (`msbuild`, `nuget`).

## Orient

- Read the C header, not only the docs. When docs and header disagree, trust the header (Win32 docs often simplify types and struct layout).
- Read the TFM (`<TargetFramework>`), RIDs and `<PlatformTarget>`. They decide `DllImport` vs `LibraryImport` and whether calling conventions matter.
- Pin down the memory contract for every buffer and handle: who allocates, who frees, and with which function.
- Find existing declarations with the codebase-memory tools when the repo is indexed (`search_code` for `DllImport`/`LibraryImport`, `trace_path` for callers), else the C# language server (csharp-ls) or Grep.

## Scope the answer

- One function: map the signature, handle strings or memory only if they occur, and stop.
- Review: run the checklist below. Don't rewrite working code.
- Don't migrate `DllImport` to `LibraryImport` unless the user asks or AOT or trimming is a requirement.
- Suggest CsWin32 only for Win32 APIs. Write callbacks only when the native API takes a function pointer.

## 1. Pick the declaration style

| | `DllImport` | `LibraryImport` |
|---|---|---|
| Mechanism | Runtime marshalling | Source generator, compile time |
| Native AOT and trim safe | No | Yes |
| Strings | `CharSet` | `StringMarshalling` |
| OS error code | `SetLastError = true` | `SetLastPInvokeError = true` |
| Available | .NET Framework and every .NET | .NET 7+ |

.NET Framework: `DllImport`. .NET 7+: `LibraryImport` for new code, and it is the only option under Native AOT.

## 2. Map the types

The mappings behind most bugs:

| C / Win32 | .NET | Why |
|---|---|---|
| `long`, `unsigned long` | `CLong`, `CULong` | 32-bit on Windows, 64-bit on 64-bit Unix. With `LibraryImport` they need `[assembly: DisableRuntimeMarshalling]` (else SYSLIB1051) |
| `size_t` | `nuint` | Pointer-sized. Never `ulong` or `int` |
| `BOOL` (Win32) | `int`, or `bool` with `[MarshalAs(UnmanagedType.Bool)]` | 4 bytes |
| `bool` (C99) | `[MarshalAs(UnmanagedType.U1)] bool` | 1 byte; the default `bool` marshalling is 4 bytes |
| `HANDLE`, owned resource | a `SafeHandle` subclass | No leak on exceptions, no double free |
| `wchar_t*`, `LPWSTR` | `string`, UTF-16 | Windows only: `wchar_t` is usually 32-bit elsewhere |
| `char*` | `string` with explicit UTF-8 or ANSI | No safe default |

Read [references/type-mapping.md](references/type-mapping.md) for the full table, blittable rules, struct layout, packing and unions.

## 3. Write the declaration

```csharp
// int32_t process_records(const Record* records, size_t count, uint32_t* out_processed);
[LibraryImport("mylib", EntryPoint = "process_records")]
internal static partial int ProcessRecords([In] Record[] records, nuint count, out uint outProcessed);
```

- Set `EntryPoint` when the C# name differs from the export, else `EntryPointNotFoundException`.
- The library name `"mylib"` resolves to `mylib.dll`, `libmylib.so` or `libmylib.dylib`. Read [references/loading-and-tooling.md](references/loading-and-tooling.md) for resolvers and per-OS names.
- Calling conventions matter only on Windows x86. If x86 is a target (`<PlatformTarget>x86</PlatformTarget>`, `win-x86` RID, build scripts), say so and add `[UnmanagedCallConv(CallConvs = [typeof(CallConvCdecl)])]` (or `CallingConvention = CallingConvention.Cdecl` on `DllImport`) to every declaration.

## 4. Strings

- Windows APIs: call the `W` variant with UTF-16 (`StringMarshalling.Utf16` / `CharSet.Unicode`). Use the `A` variant only for a stated reason.
- Cross-platform C libraries: usually UTF-8 (`StringMarshalling.Utf8`, or `[MarshalAs(UnmanagedType.LPUTF8Str)]` on `DllImport`).
- State the encoding on every string parameter. Never rely on `CharSet.Auto` or a default.
- Output buffers: `char[]`, `byte[]` or `Span<byte>` with a length. Don't introduce `StringBuilder`.
- A marshalled string is freed when the call returns. If native code keeps the pointer, allocate and free it yourself (see memory below).

## 5. Memory, handles, errors and callbacks

Exactly one side owns each allocation, and it is freed with the matching allocator. `Marshal.FreeHGlobal` on `malloc`'d memory corrupts the heap. Prefer, in order: caller allocates and frees (`Span<byte>` + length); callee allocates and the library's own free function releases it in `finally`; a `SafeHandle` whose `ReleaseHandle` calls the library's destroy function.

Read [references/memory-and-callbacks.md](references/memory-and-callbacks.md) for the three ownership models, a complete `SafeHandle` wrapper, pinning (`fixed` vs `GCHandle`), `SetLastPInvokeError` and HRESULT handling, and callbacks (`UnmanagedCallersOnly` function pointers, or rooted delegates with `GC.KeepAlive`).

## 6. Migrate DllImport to LibraryImport (only when asked or for AOT)

1. Make the containing type `partial` and the method `static partial`.
2. `[DllImport]` to `[LibraryImport]`; `CharSet` to `StringMarshalling`; `SetLastError` to `SetLastPInvokeError`.
3. Remove `CallingConvention` unless Windows x86 is a target.
4. Add explicit `MarshalAs` on every `bool`.
5. Build with `<IsAotCompatible>true</IsAotCompatible>` (or `<EnableTrimAnalyzer>` and `<EnableAotAnalyzer>`) and clear SYSLIB1050-SYSLIB1057 diagnostics. SYSLIB1054 is the analyzer that flags a `DllImport` the generator could handle.

## Verify

- Every signature matches the header: type sizes, `EntryPoint`, encoding, x86 calling convention.
- Every struct crossing the boundary: assert `Marshal.SizeOf<T>()` (or `sizeof(T)` for blittable structs) equals the native `sizeof`, with field offsets checked for packed structs.
- Ownership is written down per buffer and handle, and frees use the matching function.
- No raw `IntPtr` handle escapes the interop layer; delegates passed as callbacks stay rooted.
- `SetLastPInvokeError`/`SetLastError` is set on APIs that report OS error codes.
- A round-trip test calls the native function with known input and checks output, including a non-ASCII string.

For crashes, `DllNotFoundException`, `EntryPointNotFoundException` or silent corruption, read [references/diagnostics.md](references/diagnostics.md).

## Gotchas

- `CLong` with `LibraryImport` fails with SYSLIB1051 until the assembly has `[assembly: DisableRuntimeMarshalling]`, which also changes how `bool` and `char` marshal across the whole assembly.
- `#if WINDOWS` / `LINUX` / `MACOS` are defined only for OS-specific TFMs (`net10.0-windows`), not for `net10.0`. Use a `NativeLibrary` resolver for portable TFMs.
- `Marshal.GetFunctionPointerForDelegate` does not root the delegate. A collected delegate crashes in native code later.
- An `[UnmanagedCallersOnly]` method must be `static`, use blittable parameters, and never let an exception escape to native code.
- C++ exports without `extern "C"` are name-mangled; check the export table before blaming the signature.

Adapted from dotnet/skills `dotnet-pinvoke` (MIT, .NET Foundation and Contributors).
