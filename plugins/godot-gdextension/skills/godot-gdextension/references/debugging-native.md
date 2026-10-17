# Debugging native extensions

Applies to godot-cpp and gdext. Godot's script debugger can't step into native code; debug the library as part of the Godot process with a native debugger.

## Contents

- Hot reload
- Debug and release builds
- Attaching a debugger
- Crash triage
- Sanitizers
- Common load failures

## Hot reload

`reloadable = true` in `[configuration]` makes the editor reload the library after a rebuild. godot-cpp also needs `use_hot_reload=yes` at build time (off by default in godot-cpp 10). gdext supports it out of the box and tests it in CI. In the editor, Godot loads a temporary copy of the library, so a rebuild can overwrite the original even on Windows, where loaded DLLs are locked. Restart the editor after changing a class's registration (renamed classes, new base class), because reload keeps the old layout.

## Debug and release builds

- `template_debug` (godot-cpp default) or `cargo build` keeps assertions and debug features; add `dev_build=yes` (godot-cpp) for unoptimized code with full symbols.
- `template_release` / `cargo build --release` is what exports load. Test it before shipping; optimizer-only bugs exist.
- The `[libraries]` debug entries are used by the editor and debug exports, the release entries by release exports.

## Attaching a debugger

Build with symbols, then either launch Godot under the debugger or attach to it:

```bash
# Linux, launch the editor on the test project under gdb
gdb --args godot --editor --path project/
# or run the game directly
gdb --args godot --path project/
# macOS
lldb -- godot --path project/
```

- Windows: open the `.sln` or folder in Visual Studio, set the debug command to the Godot executable with `--path <project>`, and keep the `.pdb` next to the `.dll`.
- VS Code: a `cppdbg` (or CodeLLDB for Rust) launch configuration with `program` = the Godot binary and `args` = `["--path", "project"]`.
- Attaching to the editor process works too, but the editor spawns a separate process when you press Play; attach to that child, or run the game directly with `--path` as above.
- Breakpoints in shared-library code bind once the library loads; set them as pending breakpoints if the debugger asks.

## Crash triage

1. Run the project from a terminal so the engine's crash backtrace prints. A debug build of the extension gives symbolized frames for your code.
2. Typical causes: using a freed object (keep `Ref<>`/`Gd<>` handles or check `UtilityFunctions::is_instance_valid`), touching the scene tree off the main thread, binding a method with a signature that doesn't match its `D_METHOD` argument count, registering a subclass before its base, or an ABI mismatch from building against a newer API than the running engine.
3. Reproduce in the smallest scene; strip the extension down until the crash disappears.

## Sanitizers

For memory and undefined-behaviour bugs, build with sanitizers and run under a matching build:

- godot-cpp: add `-fsanitize=address,undefined` to `CCFLAGS` and `LINKFLAGS` (through `custom.py` or `env.Append` in your SConstruct), with GCC or Clang. Running the editor binary from a sanitizer build of Godot gives the cleanest reports; with a stock Godot binary, preload the ASan runtime (`LD_PRELOAD=$(gcc -print-file-name=libasan.so)`) on Linux.
- gdext: `RUSTFLAGS="-Zsanitizer=address" cargo +nightly build --target x86_64-unknown-linux-gnu`.

Expect some noise from the engine itself; filter reports to frames in your library.

## Common load failures

| Message (Output panel) | Cause |
|---|---|
| "No GDExtension library found for current OS and architecture" | No `[libraries]` entry matches this platform, build and architecture |
| "GDExtension dynamic library not found" / "Can't open GDExtension dynamic library" | The path in `[libraries]` is wrong, or a dependency of the library is missing |
| "GDExtension entry point '...' not found in library" | `entry_symbol` differs from the exported function name, or it isn't `extern "C"` and exported |
| "GDExtension initialization function '...' returned an error" | The init function failed; usually a binding/engine API mismatch |
| "must contain a configuration/compatibility_minimum key" or "must be at least 4.1.0" | The key is required and must be 4.1 or later |
| "GDExtension only compatible with Godot version X or later" | `compatibility_minimum` is newer than the running engine |
| Loads, but classes are missing | Registration skipped (wrong init level) or failed; read the Output from the top |
| Works in the editor, missing in the exported game | Release library not built or not listed for that platform |
