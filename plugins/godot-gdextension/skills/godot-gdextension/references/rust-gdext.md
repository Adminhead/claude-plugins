# godot-rust (gdext)

Checked against gdext v0.5.5 (crate `godot`, released 2026-08-09; features `api-4-2` to `api-4-7`) and the godot-rust book's compatibility page, 2026-10-17. Community-maintained, MPL-2.0 (your own code can stay closed; changes to gdext files themselves stay MPL). Requires Godot 4.2 or later.

## Contents

- Crate setup
- Entry point and `.gdextension`
- Classes, properties, methods, signals
- Compatibility and versions
- Platforms

## Crate setup

```toml
# rust/Cargo.toml
[package]
name = "my_ext"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
godot = { version = "0.5", features = ["api-4-4"] }
```

Pick the `api-4-x` feature for the oldest Godot you support (rule 1 in SKILL.md). Without one, gdext uses its default prebuilt API version. Keep the Godot project beside the crate (`godot/` and `rust/` folders) as the book does.

## Entry point and `.gdextension`

```rust
// rust/src/lib.rs
use godot::prelude::*;

struct MyExtension;

#[gdextension]
unsafe impl ExtensionLibrary for MyExtension {}
```

```ini
; godot/my_ext.gdextension
[configuration]
entry_symbol = "gdext_rust_init"
compatibility_minimum = "4.4"
reloadable = true

[libraries]
linux.debug.x86_64 = "res://../rust/target/debug/libmy_ext.so"
linux.release.x86_64 = "res://../rust/target/release/libmy_ext.so"
windows.debug.x86_64 = "res://../rust/target/debug/my_ext.dll"
windows.release.x86_64 = "res://../rust/target/release/my_ext.dll"
macos.debug = "res://../rust/target/debug/libmy_ext.dylib"
macos.release = "res://../rust/target/release/libmy_ext.dylib"
```

`gdext_rust_init` is the default entry symbol (`#[gdextension(entry_symbol = custom_name)]` changes it). Pointing at `target/` is convenient while developing; for exports, copy the release libraries into the project (`bin/`) and point the release entries there so they get packed.

## Classes, properties, methods, signals

```rust
use godot::classes::{ISprite2D, Sprite2D};
use godot::prelude::*;

#[derive(GodotClass)]
#[class(init, base = Sprite2D)]
struct Player {
    base: Base<Sprite2D>,
    #[export]
    #[init(val = 100)]
    hitpoints: i32,
    #[var]
    speed: f64,
}

#[godot_api]
impl ISprite2D for Player {
    fn ready(&mut self) {
        godot_print!("Player ready");
    }

    fn process(&mut self, delta: f64) {
        let step = Vector2::RIGHT * (self.speed * delta) as f32;
        let pos = self.base().get_position();
        self.base_mut().set_position(pos + step);
    }
}

#[godot_api]
impl Player {
    #[signal]
    fn died();

    #[func]
    fn take_damage(&mut self, amount: i32) {
        self.hitpoints -= amount;
        if self.hitpoints <= 0 {
            self.signals().died().emit();
        }
    }
}
```

- `#[derive(GodotClass)]` plus `#[class(init, base = X)]` registers the class with a generated constructor; `#[init(val = ...)]` sets field defaults, `#[init(node = "Path")]` with `OnReady<Gd<T>>` fetches a child at ready.
- `#[export]` shows a field in the Inspector; `#[var]` exposes it to scripts only.
- Engine virtuals come from the `I<Class>` trait (`ISprite2D`, `INode3D`); `ready`, `process`, `physics_process`, `input` drop the leading underscore.
- `#[func]` exposes a method to GDScript; `#[signal]` declares a signal, and `self.signals().<name>()` gives typed `emit` and `connect`.
- `self.base()` / `self.base_mut()` reach the engine object. Don't hold a `base_mut()` guard across a call that can re-enter your object (signal emission, `call_deferred` into self); gdext panics on the double borrow.
- `Gd<T>` is the smart pointer to engine objects. Nodes not in the tree must be freed (`free()` or `queue_free()`); `RefCounted` types free themselves.
- `#[class(tool)]` makes virtuals run in the editor, like `@tool`.

## Compatibility and versions

- The runtime engine version must be at least the API version you built for. A 4.2-built extension runs in 4.3 to 4.7; a 4.4-built one does not load in 4.3. API 4.0 builds only run on 4.0.
- gdext follows SemVer on crates.io but still makes breaking changes between 0.x minors, with migration guides in the book. Pin the minor (`"0.5"`) and read the changelog before bumping.
- Building against an unreleased or custom engine: the `api-custom` feature regenerates bindings from your Godot binary (see the book's "Selecting a Godot version").

## Platforms

Desktop is solid. Wasm (web), Android and iOS support is experimental with thin documentation; budget time for toolchain setup (Emscripten for web, the NDK for Android) and test exports early.
