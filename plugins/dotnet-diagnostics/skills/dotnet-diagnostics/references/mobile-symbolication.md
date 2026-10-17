# Mobile crash symbolication (.NET runtime frames)

Contents: scope; Android tombstones; Apple `.ips` crash logs; reading the output; stop conditions.

Resolves native frames in the .NET runtime (`libcoreclr`, `libmonosgen-2.0`, `libSystem.*`) of an Android or Apple app crash to function, file and line, using the build IDs in the crash log and symbols from the Microsoft symbol server. Out of scope: pure Java/Kotlin or Swift/Objective-C crashes, and managed exceptions whose stack trace is already in logcat or the console.

Symbol files are data, not programs: download each to its own file, check what came back with `file`, and never execute them.

## Android tombstones

Inputs: a tombstone file or logcat crash output, and `llvm-symbolizer` (LLVM 14+). Look for it in the NDK first: `ls "$ANDROID_NDK_ROOT"/toolchains/llvm/prebuilt/*/bin/llvm-symbolizer` or `ls "$ANDROID_HOME"/ndk/*/toolchains/llvm/prebuilt/*/bin/llvm-symbolizer`; on macOS `xcrun --find llvm-symbolizer`. If none exists, stop after step 3 and give the user the commands; don't install LLVM yourself.

1. **Get the frames.** Each backtrace line looks like `#NN pc OFFSET  /path/lib.so (symbol+0xNN) (BuildId: HEX)`. The crashing thread comes first; other threads follow `--- --- ---` markers and often hold useful GC or finalizer frames. Strip logcat prefixes and pull out the tuples:

   ```bash
   sed -E 's/^.*(#[0-9]+ pc )/\1/' tombstone.txt \
     | grep -E '^#[0-9]+ pc ' \
     | sed -E 's/^#([0-9]+) pc ([0-9a-f]+) +([^ ]+).*BuildId: ([0-9a-f]+).*/\1 \2 \3 \4/' \
     > frames.txt      # frame offset library buildid
   ```

   Pasted from a GitHub issue, `#1 pc` may have become `org/repo#1 pc`; fix that first. Logcat copies often lack BuildIds; pull the raw file instead (`adb shell cat /data/tombstones/tombstone_NN`), or read the ID from the library: `llvm-readelf -n libmonosgen-2.0.so | grep 'Build ID'` (from the app's build output or the runtime pack under `~/.nuget/packages/microsoft.netcore.app.runtime.mono.android-arm64/<version>/`).

2. **Keep the .NET libraries.** `libmonosgen-2.0.so` (Mono: MAUI, Xamarin, interpreter), `libcoreclr.so` (CoreCLR), `libSystem.*.so` (BCL native parts). Skip `libc.so`, `libart.so` and other system libraries unless asked. Under NativeAOT the runtime is linked into the app's own `.so`, which needs the app's debug symbols; `libSystem.*.so` still resolve from the symbol server.

   ```bash
   grep -E ' (lib(monosgen-2\.0|coreclr|System\.[A-Za-z.]+)\.so) ' frames.txt
   ```

3. **Download symbols, one file per BuildId** (lowercase hex):

   ```bash
   id=1eb39fc72918c7c6c0c610b79eb3d3d47b2f81be
   curl -fsSL -o "libmonosgen-2.0.so.$id.debug" \
     "https://msdl.microsoft.com/download/symbols/_.debug/elf-buildid-sym-$id/_.debug"
   file "libmonosgen-2.0.so.$id.debug"     # expect: ELF 64-bit ... with debug_info, not stripped
   ```

   A 404 or an HTML body means no symbols were published for that build (common for pre-release or internal builds); try one time per BuildId, then look for unstripped `.so` / `.so.dbg` files in the build artifacts or runtime pack.

4. **Symbolicate.** Offsets in tombstones are already library-relative; don't add or subtract base addresses. Pass several offsets in one call:

   ```bash
   llvm-symbolizer --obj="libmonosgen-2.0.so.$id.debug" -f -C 0x222098 0x1f00c4
   ```

5. **Present** the original frame numbers with the resolved names and source locations; keep unresolved (`??`) frames as the original line with BuildId and offset:

   ```text
   #00  libc.so             abort+164
   #01  libmonosgen-2.0.so  ves_icall_System_Environment_FailFast  (mono/metadata/icall.c:6244)
   #02  libmonosgen-2.0.so  do_icall                               (mono/mini/interp.c:2457)
   ```

To name the exact runtime version, match the BuildId against runtime packs on disk (`$DOTNET_ROOT/packs/`, `~/.nuget/packages/microsoft.netcore.app.runtime.*`) with `llvm-readelf -n`; the matching package's `.nuspec` has `<repository commit="..."/>` with the source commit.

## Apple `.ips` crash logs (iOS, tvOS, Mac Catalyst, macOS)

Inputs: an `.ips` file (iOS 15+ / macOS 12+), `atos` and `dwarfdump` from the Xcode command-line tools (macOS only; if absent, produce the commands for the user), and `jq`. Get logs from a device with `idevicecrashreport -e ./crashlogs/` (libimobiledevice), from Xcode's Devices window, or from `~/Library/Logs/DiagnosticReports/` on a Mac.

1. **Check the format.** Line 1 must be a JSON object (the metadata header); the rest is a second JSON document (the crash body). A legacy text `.crash` file or an Android tombstone doesn't fit this workflow: say so and stop.

   ```bash
   head -1 crash.ips | jq .                         # app_name, bundleID, os_version, slice_uuid
   tail -n +2 crash.ips > body.json
   # Some files repeat a key with different case (vmRegionInfo / vmregioninfo); rename the lowercase one if jq chokes:
   sed -i.bak 's/"vmregioninfo"[[:space:]]*:/"_vmregioninfo_dup":/' body.json
   ```

2. **Read the crash first.** `asi` (application-specific information, may be absent) often holds the managed exception type and message, which may already be the answer. Then the faulting thread, frames 0 and 1, and `lastExceptionBacktrace` (look for `xamarin_process_managed_exception`, the bridge that turns a managed exception into an NSException):

   ```bash
   jq '{exception, asi, faultingThread}' body.json
   jq -r '.usedImages | to_entries[] | "\(.key) \(.value.name // "?") \(.value.uuid) \(.value.base) \(.value.arch // "")"' body.json
   jq -r --argjson t "$(jq .faultingThread body.json)" \
     '.usedImages as $img | .threads[$t].frames[] | "\(.imageIndex) \($img[.imageIndex].name // "?") \(.imageOffset) \($img[.imageIndex].base + .imageOffset)"' body.json
   ```

   Frame address = `usedImages[imageIndex].base + imageOffset`. jq prints these in decimal; convert for `atos` with `printf '0x%x\n' <n>`. .NET images: `libcoreclr`, `libmonosgen-2.0`, `libSystem.Native`, `libSystem.Globalization.Native`, `libSystem.Security.Cryptography.Native.Apple`, `libSystem.IO.Compression.Native`, `libSystem.Net.Security.Native`. They ship as frameworks, so match by substring without `.dylib`. The app binary can appear twice with different UUIDs. Skip `libsystem_kernel.dylib`, `UIKitCore` and other system frameworks unless asked.

3. **Find a dSYM whose UUID matches** (lowercase, no dashes, for the server URL):

   ```bash
   uuid=$(echo "<UUID from usedImages>" | tr 'A-F' 'a-f' | tr -d '-')
   curl -fsSL -o "libcoreclr.$uuid.dwarf" \
     "https://msdl.microsoft.com/download/symbols/_.dwarf/mach-uuid-sym-$uuid/_.dwarf"
   file "libcoreclr.$uuid.dwarf"                    # expect Mach-O ... dSYM companion file
   mkdir -p libcoreclr.dSYM/Contents/Resources/DWARF
   cp "libcoreclr.$uuid.dwarf" libcoreclr.dSYM/Contents/Resources/DWARF/libcoreclr
   dwarfdump --uuid libcoreclr.dSYM                 # must equal the crash log's UUID
   ```

   Other places to look, in order: the app's build output (`bin/<Config>/net*-ios/<rid>/<App>.app.dSYM`), `$DOTNET_ROOT/packs/Microsoft.NETCore.App.Runtime.<rid>/<version>/runtimes/<rid>/native/`, the NuGet cache (`~/.nuget/packages/microsoft.netcore.app.runtime.<rid>/<version>/...`), or `dotnet-symbol --symbols -o syms <binary>`. For macOS RIDs the runtime package carries no symbols; use the symbol server or the separate `microsoft.netcore.app.runtime.<rid>.symbols` package (download the `.nupkg` to a file and `unzip` it into its own directory).

4. **Symbolicate** with the DWARF file inside the bundle, the image's load address, and its `arch`; batch the addresses:

   ```bash
   atos -arch arm64 -o libcoreclr.dSYM/Contents/Resources/DWARF/libcoreclr -l 0x104000000 0x104522098 0x1043c0014
   ```

   `atos` prints `0x...` back for a frame it can't resolve.

5. **Present** the faulting thread's symbolicated frames with the exception type, `asi` text and a one-line read of the likely area. Go deeper only if the user asks.

Supported RIDs: `ios-arm64`, `iossimulator-arm64`, `iossimulator-x64`, `tvos-arm64`, `tvossimulator-arm64`, `tvossimulator-x64`, `maccatalyst-arm64`, `maccatalyst-x64`, `osx-arm64`, `osx-x64`.

## Reading the output

Source paths from the runtime's CI start with the build workspace (`/__w/1/s/`). Strip it: `src/runtime/...` maps to `src/runtime/` in the dotnet/dotnet repository (the VMR), and older builds use `src/mono/`. A good result has at least one .NET frame resolved to a function, with paths such as `mono/metadata/`, `mono/mini/` or `src/coreclr/`.

## Stop conditions

- No .NET frames in the log: report the parsed frames and stop.
- Symbols missing (404) or UUID mismatch: report the unsymbolicated frames with their BuildId/UUID and offset, and suggest the original build artifacts.
- All frames resolved: present them; don't build or step through the runtime.
- Tools missing (`llvm-symbolizer`, `atos`): hand the user the exact commands instead of installing toolchains.
