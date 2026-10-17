# Native-to-.NET type mapping

Every parameter must match the native type exactly. Read this when a type is not in the SKILL.md table, or for struct layout and blittable questions.

## Primitives

| C / Win32 | .NET | Notes |
|---|---|---|
| `int`, `int32_t` | `int` | 32-bit on every supported ABI |
| `unsigned int`, `uint32_t`, `DWORD` | `uint` | |
| `short`, `int16_t` / `uint16_t`, `WORD` | `short` / `ushort` | |
| `int8_t` / `uint8_t`, `BYTE` | `sbyte` / `byte` | |
| `int64_t`, `long long` | `long` | |
| `uint64_t`, `unsigned long long` | `ulong` | |
| `HRESULT` | `int` | Pass to `Marshal.ThrowExceptionForHR` |
| `float`, `double` | `float`, `double` | |

## Types that cause most bugs

| C / Win32 | .NET | Why |
|---|---|---|
| `long` / `unsigned long` | `CLong` / `CULong` (.NET 6+) | 32-bit on Windows, 64-bit on 64-bit Unix. Never `int` or `long`. With `LibraryImport`, needs `[assembly: DisableRuntimeMarshalling]` or the generator reports SYSLIB1051; `DllImport` works without it |
| `size_t` | `nuint` | Pointer-sized. `nuint` and `UIntPtr` are the same type on C# 11 / .NET 7+. Never `ulong`: wrong on 32-bit |
| `ssize_t`, `intptr_t`, `ptrdiff_t` | `nint` | Pointer-sized |
| `BOOL` (Win32) | `int`, or `[MarshalAs(UnmanagedType.Bool)] bool` | 4 bytes |
| `bool` (C99, C++) | `[MarshalAs(UnmanagedType.U1)] bool` | 1 byte |
| `wchar_t` | `char` on Windows only | `wchar_t` is 4 bytes on Linux and macOS; use `uint`/UTF-32 there |
| `char16_t` | `char` | |
| `void*` | `void*` (unsafe) or `nint` | |
| `T*` out parameter | `out T` / `ref T` | `ref` when native reads it too |

## Handles and strings

| C / Win32 | .NET | Notes |
|---|---|---|
| `HANDLE`, `HWND`, opaque `struct foo*` the caller must release | `SafeHandle` subclass | Prefer over raw `IntPtr` |
| `LPWSTR` / `const wchar_t*` | `string` with UTF-16 | Cheapest `in` string on Windows; avoid `wchar_t` in cross-platform APIs |
| `LPSTR` / `const char*` | `string` with explicit UTF-8 or ANSI | Always costs a conversion for `in` parameters |
| `char*` output buffer | `byte[]` / `Span<byte>` + length | Decode with `Encoding.UTF8.GetString` |

## Blittable types

Blittable types have the same managed and native layout and marshal with no copy.

- Blittable: `byte`, `sbyte`, `short`, `ushort`, `int`, `uint`, `long`, `ulong`, `float`, `double`, `nint`, `nuint`, pointers, function pointers, and structs made only of these.
- With `[assembly: DisableRuntimeMarshalling]`, `bool` (1 byte) and `char` (2 bytes) also count as blittable, and non-blittable parameter types become compile errors under `LibraryImport`.
- Not blittable without it: `bool`, `char`, `string`, `decimal`, arrays of non-blittable types, anything carrying `MarshalAs`.

Blittable structs can be passed by pointer, `ref`, or `Span<T>` without copying; prefer them for hot calls.

## Struct layout

```csharp
// Sequential (default for C structs)
[StructLayout(LayoutKind.Sequential)]
internal struct Vec3 { public float X, Y, Z; }

// Union: typedef union { int32_t i; float f; } Value;
[StructLayout(LayoutKind.Explicit, Size = 4)]
internal struct Value
{
    [FieldOffset(0)] public int I;
    [FieldOffset(0)] public float F;
}

// #pragma pack(push, 1)
[StructLayout(LayoutKind.Sequential, Pack = 1)]
internal struct PackedHeader
{
    public byte Magic;
    public uint Size;    // offset 1, not 4
    public ushort Flags; // offset 5, not 8
}

// Fixed-size inline array: char name[32];
internal unsafe struct Named { public fixed byte Name[32]; }
// or on .NET 8+: [InlineArray(32)] struct Name32 { private byte _e0; }
```

Check layout in a test: `Marshal.SizeOf<T>()` (marshalled size) or `sizeof(T)` / `Unsafe.SizeOf<T>()` (blittable size) against the C `sizeof`, and `Marshal.OffsetOf<T>(nameof(Field))` against `offsetof`.
