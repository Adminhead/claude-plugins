# Library loading and generators

Read this when a library must load on several OSes, ship with the app, or when generating bindings instead of writing them.

## Library names and search

- A bare name (`"mylib"`) is probed with platform prefixes and suffixes: `mylib.dll` on Windows, `libmylib.so` on Linux, `libmylib.dylib` on macOS. Prefer the bare name.
- NuGet packages carry native assets under `runtimes/<rid>/native/`; the SDK copies the right one for the RID. Packaging is `nuget`/`msbuild` work.
- Linux: the loader searches the app directory, then `LD_LIBRARY_PATH`, the binary's `rpath`/`runpath`, and the system paths (`ldconfig` cache). macOS: the app directory, `DYLD_LIBRARY_PATH`, the install name and `@rpath`.
- `[DefaultDllImportSearchPaths(DllImportSearchPath.SafeDirectories)]` (or `System32` for OS DLLs) narrows the Windows search and avoids loading a planted DLL from the current directory.

## Per-OS names

Compile-time symbols work only for OS-specific TFMs:

```csharp
// WINDOWS / LINUX / MACOS are defined for net10.0-windows etc., not for net10.0.
#if WINDOWS
private const string LibName = "mylib.dll";
#else
private const string LibName = "mylib";
#endif
```

For portable TFMs, register a resolver once, before the first call:

```csharp
NativeLibrary.SetDllImportResolver(typeof(MyLib).Assembly, (name, assembly, searchPath) =>
{
    if (name != "mylib") return IntPtr.Zero; // fall back to default probing
    string file = OperatingSystem.IsWindows() ? "mylib.dll"
        : OperatingSystem.IsMacOS() ? "libmylib.dylib"
        : "libmylib.so.1";
    return NativeLibrary.TryLoad(file, assembly, searchPath, out var h) ? h : IntPtr.Zero;
});
```

Only one resolver per assembly is allowed; a second call throws. On netstandard2.0 use `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` instead of `OperatingSystem.IsWindows()`, and note that `NativeLibrary` itself needs .NET Core 3.0+.

`NativeLibrary.Load`/`TryLoad` plus `GetExport` give manual loading and function lookup; combine `GetExport` with a `delegate* unmanaged<...>` cast for optional exports.

## Generators

- **Win32 APIs: CsWin32** (`Microsoft.Windows.CsWin32`). Add the package, list the APIs in `NativeMethods.txt`, and it generates declarations, structs, constants and `SafeHandle` types from Windows metadata. Prefer it over hand-written Win32 signatures; check its current version on NuGet, since it is still 0.x.
- **WinRT APIs: CsWinRT** (`Microsoft.Windows.CsWinRT`) generates projections from `.winmd` files.
- **Large C libraries:** ClangSharp's `ClangSharpPInvokeGenerator` generates bindings from headers. Review its output against the type rules; it cannot know ownership contracts.
- **Objective-C (macOS, iOS):** Objective Sharpie produces initial binding definitions; the bindings themselves are .NET for iOS/macOS work.
