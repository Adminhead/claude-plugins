# Memory ownership, SafeHandle, errors and callbacks

Read this when memory, a handle or a function pointer crosses the boundary.

## Ownership models

Exactly one side owns each allocation, and both sides agree which.

**1. Caller allocates, caller frees (safest).**

```csharp
[LibraryImport("mylib")]
private static partial int GetName(Span<byte> buffer, nuint bufferSize, out nuint actualSize);

public static string GetName()
{
    Span<byte> buffer = stackalloc byte[256];
    int rc = GetName(buffer, (nuint)buffer.Length, out nuint actual);
    if (rc != 0) throw new InvalidOperationException($"get_name failed: {rc}");
    return Encoding.UTF8.GetString(buffer[..(int)actual]);
}
```

If the API reports a required size, call once to get it, rent or allocate that size, then call again.

**2. Callee allocates, caller frees with the library's function.**

```csharp
[LibraryImport("mylib")] private static partial nint GetVersion();
[LibraryImport("mylib")] private static partial void FreeString(nint s);

public static string GetVersion()
{
    nint p = GetVersion();
    try { return Marshal.PtrToStringUTF8(p) ?? throw new InvalidOperationException(); }
    finally { FreeString(p); }
}
```

Free with the matching allocator only: `malloc` with the library's free (or `NativeMemory.Free` only when the library documents plain `malloc` from the same C runtime), `CoTaskMemAlloc` with `Marshal.FreeCoTaskMem`, `LocalAlloc`/`GlobalAlloc` with their frees. Never `Marshal.FreeHGlobal` on `malloc`'d memory.

**3. Handle-based: callee allocates and callee frees.** Wrap in a `SafeHandle`.

When native code must keep memory you hand it (a string it stores, a buffer it fills later), allocate unmanaged memory yourself: `Marshal.AllocCoTaskMem`/`FreeCoTaskMem` on Windows or .NET Framework, `NativeMemory.Alloc`/`Free` elsewhere, or the library's own allocator if it has one.

## SafeHandle wrapper

```csharp
internal sealed partial class MyLibHandle : SafeHandleZeroOrMinusOneIsInvalid
{
    // Used by the marshaller to create the handle; no direct callers.
    private MyLibHandle() : base(ownsHandle: true) { }

    [LibraryImport("mylib", StringMarshalling = StringMarshalling.Utf8)]
    private static partial MyLibHandle CreateHandle(string config);

    [LibraryImport("mylib")]
    private static partial int UseHandle(MyLibHandle h, ReadOnlySpan<byte> data, nuint len);

    [LibraryImport("mylib")]
    private static partial void DestroyHandle(nint h);

    protected override bool ReleaseHandle() { DestroyHandle(handle); return true; }

    public static MyLibHandle Create(string config)
    {
        var h = CreateHandle(config);
        if (h.IsInvalid) { h.Dispose(); throw new InvalidOperationException("create_handle failed"); }
        return h;
    }

    public int Use(ReadOnlySpan<byte> data) => UseHandle(this, data, (nuint)data.Length);
}

using var handle = MyLibHandle.Create("config=value");
```

`SafeHandle` keeps the handle alive for the duration of each call (the GC cannot finalize it mid-call), releases it once, and survives exceptions. Keep raw `nint` handles inside the interop layer only.

## Pinning managed memory

- Synchronous call: `fixed (byte* p = data) { Process(p, (nuint)data.Length); }`, or pass `Span<T>`/arrays to `LibraryImport`, which pins for the call.
- Native code keeps the pointer after the call returns, or works asynchronously: `GCHandle.Alloc(data, GCHandleType.Pinned)`, free it only after native code is done; or allocate unmanaged memory instead (often simpler). On .NET 5+, `GC.AllocateArray<T>(n, pinned: true)` gives an array on the pinned heap.

## Errors

```csharp
[LibraryImport("kernel32", SetLastPInvokeError = true)]
[return: MarshalAs(UnmanagedType.Bool)]
internal static partial bool CloseHandle(nint hObject);

if (!CloseHandle(h)) throw new Win32Exception(Marshal.GetLastPInvokeError());

// POSIX errno: SetLastPInvokeError = true captures errno too; read it immediately.
// HRESULT:
Marshal.ThrowExceptionForHR(hr);
```

Read the error right after the call; any other interop call in between can overwrite it. `Marshal.GetLastWin32Error()` still works but `GetLastPInvokeError()` is the name for both styles on .NET 6+.

## Callbacks

**Preferred: `UnmanagedCallersOnly` and a function pointer** (.NET 5+, C# 9). No delegate, so nothing to keep alive.

```csharp
[UnmanagedCallersOnly]
private static void OnLog(int level, nint message)
{
    try { Log(level, Marshal.PtrToStringUTF8(message) ?? ""); }
    catch { /* never let an exception reach native code */ }
}

[LibraryImport("mylib")]
private static unsafe partial void SetLogCallback(delegate* unmanaged<int, nint, void> cb);

unsafe { SetLogCallback(&OnLog); }
```

The method must be `static` with blittable parameters. On Windows x86 add `CallConvs = [typeof(CallConvCdecl)]` and use `delegate* unmanaged[Cdecl]<...>`. Pass instance state through the API's `void* user_data` parameter as a `GCHandle.ToIntPtr` value.

**Fallback: a delegate, kept rooted** (older TFMs, or code that already uses delegates).

```csharp
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] // only matters on Windows x86
private delegate void LogCallback(int level, nint message);

private static LogCallback? s_logCallback; // rooted for as long as native code may call it

public static void EnableLogging(Action<int, string> handler)
{
    s_logCallback = (level, msg) => handler(level, Marshal.PtrToStringUTF8(msg) ?? "");
    SetLogCallback(s_logCallback);
}
```

If native code stores the pointer, the delegate must stay rooted until native code is told to stop calling it. For a pointer used only during one call:

```csharp
var cb = new LogCallback(OnLogManaged);
nint fn = Marshal.GetFunctionPointerForDelegate(cb);
NativeUsesCallback(fn);
GC.KeepAlive(cb); // fn does not root the delegate
```
