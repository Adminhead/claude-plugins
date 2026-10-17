---
name: godot-gdextension
description: Native Godot 4 extensions with GDExtension, in C++ (godot-cpp) or Rust (godot-rust gdext). Use when a project has a .gdextension file, SConstruct or a godot-cpp submodule, or when binding a native class, building per-platform libraries, wrapping a C/C++ library, debugging a native crash, or an export that reports "No GDExtension library found".
---

# GDExtension

GDExtension loads a shared library into a stock Godot build, so no custom engine is needed. Its classes look like built-in ones to GDScript and the editor. Version-specific details are in the references; this file holds the decisions and the rules that don't change.

## When to go native

Use GDScript or C# first. Profile before deciding (see `godot`'s performance guidance). GDExtension earns its cost when:

- A measured hot loop is still too slow after algorithmic fixes and typed GDScript (pathfinding over huge grids, voxel meshing, custom physics, simulation).
- You must call an existing C or C++ library (a codec, a physics or networking SDK).
- You are writing a language binding or a server-level component, such as a custom `TextServerExtension`.

It costs you a build for every platform and architecture you ship, native crashes that take the editor down, and binaries in version control or CI. If only the engine itself needs patching, an engine module (compiled in) is the other route, but that means shipping a custom editor and export templates.

## Pick the binding

| Binding | Use when | Read |
|---|---|---|
| godot-cpp (official, C++) | Default. Wrapping C/C++ libraries, the official docs and template | [references/cpp-binding.md](references/cpp-binding.md) |
| gdext (godot-rust, community, MPL-2.0) | The team writes Rust and wants memory safety and cargo | [references/rust-gdext.md](references/rust-gdext.md) |

Debugging native code, hot reload and sanitizers for both: [references/debugging-native.md](references/debugging-native.md).

## Rules that hold for every binding

1. **Target the oldest engine you support.** Extensions are forward-compatible within Godot 4: one built against 4.3's API loads in 4.4 to 4.7, but not the reverse. The exception is 4.0: extensions built for 4.0 don't load in 4.1+. Set the build's API version (godot-cpp `api_version`, gdext `api-4-x` feature) and `compatibility_minimum` in the `.gdextension` file to the same version.
2. **The `.gdextension` file is the contract.** `entry_symbol` must equal the exported init function name. `[libraries]` maps feature tags (`linux.debug.x86_64`, `windows.release.x86_64`, `macos.release`, `android.release.arm64`, `web.release.wasm32`) to binaries; entries match top to bottom, so put more specific tags first. Prefer paths relative to the `.gdextension` file so the folder can move. `[icons]` gives nodes editor icons; `[dependencies]` lists extra shared libraries to copy on export.
3. **Ship release binaries.** An export loads `template_release` builds. If the matching entry is missing for a platform, the native classes don't exist at runtime and scenes using them break. Build every platform in CI (the godot-cpp template ships GitHub Actions workflows).
4. **`reloadable = true` is for development.** It reloads the library in the editor on rebuild (godot-cpp on 4.2+; gdext supports it too). Restart the editor if a class layout change confuses the reload.
5. **Put it in an addon folder** (`addons/<name>/` with `bin/` and the `.gdextension`) when it will be reused or shared, so other projects copy one folder.
6. **Calling from scripts.** GDScript sees registered classes as built-in types (`MyNode.new()`, typed vars, autocompletion). C# does not get generated wrappers for extension classes: use `ClassDB.Instantiate("MyNode")`, `Get`/`Set`/`Call`/`Connect` by name, or write a thin C# wrapper class.

## Workflow

1. Start from the official template (godot-cpp-template) or `cargo new --lib` for gdext; keep a small Godot test project in the repo (`project/` or `godot/`).
2. Set the API version and `compatibility_minimum` (rule 1).
3. Bind one class, build for the host (`scons` or `cargo build`), open the test project, and confirm the class appears in the Create Node dialog and runs.
4. Add properties, signals and methods; rebuild with `reloadable = true` while iterating.
5. Build `template_release` for each shipping platform; export the test project once per platform before calling it done.

## Gotchas

- A misspelt `entry_symbol` shows only as "GDExtension entry point '...' not found" in the Output; the classes just don't appear. `compatibility_minimum` is mandatory and must be 4.1 or later.
- Godot 4.7 builds of the engine no longer build `text_server_adv`/`text_server_fb` as GDExtensions; writing your own `TextServerExtension` is unaffected.
- Godot 4.7 changed `Object.is_class()` to take a `StringName`; old binaries rely on the engine's compatibility mapping, so rebuild against 4.7 bindings when you move to 4.7 APIs.
- Classes registered at `MODULE_INITIALIZATION_LEVEL_SCENE` exist in the editor and in exports. Editor-only classes (an `EditorPlugin` written natively) register at `MODULE_INITIALIZATION_LEVEL_EDITOR` and are absent from exports, so runtime scenes must never reference them.
- In godot-cpp, a node class whose `_process` should not run inside the editor is registered with `GDREGISTER_RUNTIME_CLASS`; plain `GDREGISTER_CLASS` runs its virtuals in the editor too, like a `@tool` script.
- Native code that touches the scene tree from a worker thread crashes like any other engine code; use `call_deferred` or the WorkerThreadPool and keep tree access on the main thread.

Adapted from GodotPrompter (MIT, jame581/GodotPrompter), skill `gdextension`; see `NOTICE`.
