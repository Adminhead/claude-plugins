# godot-cpp (C++)

Checked against godot-cpp 10.0.0-stable (released 2026-09-15), the godot-cpp-template repository and the Godot 4.7 docs, 2026-10-17.

## Contents

- Versions: v10 versus the old per-engine branches
- Project setup
- Binding a class
- Entry point and registration
- The `.gdextension` file
- Building
- Godot 4.7 interface notes

## Versions: v10 versus the old per-engine branches

- **godot-cpp 10.x** is versioned independently of Godot. One checkout targets Godot 4.3 or later through the `api_version` build option (or a `custom_api_file` dumped with `godot --dump-extension-api`). There are no `4.6` or `4.7` branches; use the 10.x release tag (or `master`) for those engine versions.
- **Branches `4.0` to `4.5`** are the old scheme, where the branch must match the target engine. Projects already pinned to one keep working; new projects should use 10.x.
- The Godot 4.7 tutorial page still describes the branch scheme. The godot-cpp README is the current source.

Recommended: set the default target in your own `SConstruct` so every build uses it:

```python
env = SConscript("godot-cpp/SConstruct", {"api_version": "4.4", "env": env, "customs": customs})
```

Choose the oldest engine version you support, and put the same value in `compatibility_minimum`.

## Project setup

Start from godot-cpp-template ("Use this template" on GitHub, or clone it): `src/`, a test project in `project/`, godot-cpp as a submodule, an `SConstruct`, and CI workflows. Then:

```bash
git submodule update --init --recursive
git -C godot-cpp checkout 10.0.0-stable   # the template's .gitmodules may still pin an old branch
git add godot-cpp
```

Rename `libname` in `SConstruct`, the `EXTENSION-NAME` paths and `entry_symbol` in `project/bin/example.gdextension`, and the init function in `src/register_types.cpp` to match. The toolchain is the same as for building Godot itself (SCons, Python, a C++17 compiler; MSVC or MinGW on Windows, Xcode tools on macOS). CMake is also supported (`tutorials/scripting/cpp/build_system/cmake` in the docs).

## Binding a class

```cpp
// src/wave_sprite.h
#pragma once
#include <godot_cpp/classes/sprite2d.hpp>

namespace godot {

class WaveSprite : public Sprite2D {
	GDCLASS(WaveSprite, Sprite2D)

	double time = 0.0;
	double amplitude = 10.0;
	double speed = 1.0;

protected:
	static void _bind_methods();

public:
	void _process(double p_delta) override;
	void set_amplitude(double p_amplitude) { amplitude = p_amplitude; }
	double get_amplitude() const { return amplitude; }
	void set_speed(double p_speed) { speed = p_speed; }
	double get_speed() const { return speed; }
};

} // namespace godot
```

```cpp
// src/wave_sprite.cpp
#include "wave_sprite.h"
#include <godot_cpp/core/class_db.hpp>

using namespace godot;

void WaveSprite::_bind_methods() {
	ClassDB::bind_method(D_METHOD("set_amplitude", "amplitude"), &WaveSprite::set_amplitude);
	ClassDB::bind_method(D_METHOD("get_amplitude"), &WaveSprite::get_amplitude);
	ADD_PROPERTY(PropertyInfo(Variant::FLOAT, "amplitude"), "set_amplitude", "get_amplitude");

	ClassDB::bind_method(D_METHOD("set_speed", "speed"), &WaveSprite::set_speed);
	ClassDB::bind_method(D_METHOD("get_speed"), &WaveSprite::get_speed);
	ADD_PROPERTY(PropertyInfo(Variant::FLOAT, "speed", PROPERTY_HINT_RANGE, "0,20,0.01"), "set_speed", "get_speed");

	ADD_SIGNAL(MethodInfo("wrapped", PropertyInfo(Variant::VECTOR2, "position")));
}

void WaveSprite::_process(double p_delta) {
	time += speed * p_delta;
	Vector2 pos(amplitude * Math::sin(time), amplitude * Math::cos(time * 1.5));
	set_position(pos);
	if (time > Math::TAU) {
		time -= Math::TAU;
		emit_signal("wrapped", pos);
	}
}
```

- `GDCLASS(Class, Parent)` is the first line of the class body.
- `ClassDB::bind_method(D_METHOD("name", "arg"...), &Class::method)` exposes a method and names its arguments for scripts and docs. Static methods use `ClassDB::bind_static_method("ClassName", D_METHOD(...), &Class::fn)`.
- `ADD_PROPERTY(PropertyInfo(type, "name", hint, "hint_string"), "setter", "getter")` adds an Inspector property; bind both accessors first. `ADD_GROUP("Motion", "motion_")` groups properties by prefix.
- `ADD_SIGNAL(MethodInfo("name", PropertyInfo(...)))` declares a signal; emit with `emit_signal("name", args...)`.
- Enums: `BIND_ENUM_CONSTANT(VALUE)` with `VARIANT_ENUM_CAST(Class::Enum)` after the class.
- Virtual methods scripts can override: `GDVIRTUAL1R(...)` and `GDVIRTUAL_BIND` (see godot-cpp's `test/` project for examples).
- Engine virtuals (`_ready`, `_process`, `_physics_process`, `_input`) are overridden like normal C++ virtuals; don't bind them.

Docs: put `doc_classes/*.xml` next to the source and the template's `SConstruct` compiles them in, so the editor's help shows your classes (Godot 4.3+).

## Entry point and registration

```cpp
// src/register_types.cpp
#include <gdextension_interface.h>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/godot.hpp>
#include "wave_sprite.h"

using namespace godot;

void initialize_wave(ModuleInitializationLevel p_level) {
	if (p_level != MODULE_INITIALIZATION_LEVEL_SCENE) {
		return;
	}
	GDREGISTER_RUNTIME_CLASS(WaveSprite);  // _process doesn't run in the editor
}

void uninitialize_wave(ModuleInitializationLevel p_level) {}

extern "C" GDExtensionBool GDE_EXPORT wave_library_init(
		GDExtensionInterfaceGetProcAddress p_get_proc_address,
		GDExtensionClassLibraryPtr p_library,
		GDExtensionInitialization *r_initialization) {
	GDExtensionBinding::InitObject init_obj(p_get_proc_address, p_library, r_initialization);
	init_obj.register_initializer(initialize_wave);
	init_obj.register_terminator(uninitialize_wave);
	init_obj.set_minimum_library_initialization_level(MODULE_INITIALIZATION_LEVEL_SCENE);
	return init_obj.init();
}
```

Registration macros: `GDREGISTER_CLASS` (runs in the editor too, like a `@tool` script), `GDREGISTER_RUNTIME_CLASS` (instantiable in the editor but virtuals don't run there), `GDREGISTER_VIRTUAL_CLASS`, `GDREGISTER_ABSTRACT_CLASS` (base classes scripts can extend but not instantiate), `GDREGISTER_INTERNAL_CLASS` (hidden from the editor). Register a base class before its subclasses. Editor-only classes (`EditorPlugin` subclasses) register when `p_level == MODULE_INITIALIZATION_LEVEL_EDITOR` and also need `EditorPlugins::add_by_type<MyPlugin>()`.

## The `.gdextension` file

```ini
[configuration]
entry_symbol = "wave_library_init"
compatibility_minimum = "4.4"
reloadable = true

[libraries]
linux.debug.x86_64 = "./bin/libwave.linux.template_debug.x86_64.so"
linux.release.x86_64 = "./bin/libwave.linux.template_release.x86_64.so"
windows.debug.x86_64 = "./bin/wave.windows.template_debug.x86_64.dll"
windows.release.x86_64 = "./bin/wave.windows.template_release.x86_64.dll"
macos.debug = "./bin/libwave.macos.template_debug.framework"
macos.release = "./bin/libwave.macos.template_release.framework"
android.debug.arm64 = "./bin/libwave.android.template_debug.arm64.so"
android.release.arm64 = "./bin/libwave.android.template_release.arm64.so"

[icons]
WaveSprite = "./icons/wave_sprite.svg"
```

Other `[configuration]` keys: `compatibility_maximum` (4.3+) and `android_aar_plugin` (the libraries ship inside an Android v2 plugin AAR). Icons are 16x16 SVGs with Import options "Scale with Editor Scale" and "Convert Colors with Editor Theme" on.

## Building

```bash
scons                                  # host platform, target=template_debug (default)
scons target=template_release          # optimized build for exports
scons platform=windows arch=x86_64 target=template_release
scons platform=android arch=arm64 target=template_release
scons platform=web target=template_release   # needs Emscripten
scons compiledb=yes                    # compile_commands.json for clangd/IDEs
scons dev_build=yes                    # dev checks, debug symbols, no optimization
scons use_hot_reload=yes               # needed for reloadable = true to work
```

Other options: `precision=double` must match a double-precision engine build; `build_profile=build_profile.json` disables unused engine classes to cut build time; `use_hot_reload=yes` adds the bookkeeping that `reloadable = true` needs and is off by default in godot-cpp 10, so pass it for the builds you hot-reload. The first build compiles all of godot-cpp and takes a while; later builds are incremental.

Cross-compiling every platform locally is painful. Use the template's `make_build.yml` GitHub workflow to produce all binaries and download them as one artifact.

## Godot 4.7 interface notes

These matter only to code that calls the raw GDExtension C interface or vendors its headers; godot-cpp handles them.

- `gdextension_interface.h` and the interface JSON now live in the godot-headers repository instead of godot-cpp (GH-115401).
- `object_cast_to` and `classdb_get_class_tag` are deprecated in favour of `is_class`-based casts (GH-119254).
- New refcount-aware entry points `classdb_construct_object3` and `classdb_register_extension_class6` (GH-118214).
- `Object.is_class()` takes a `StringName` (rebuild against 4.7 bindings when targeting 4.7).
