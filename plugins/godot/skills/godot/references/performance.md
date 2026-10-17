# Performance in Godot

Godot's profiler and monitors, and the engine-specific fixes for script, rendering, physics and memory cost. The measure-first method, frame budgets and the CPU-versus-GPU split are in `game-performance`; moving work off the main thread is in `references/threading.md`.

## Measure first

- Profile a release-like build on the target hardware, in the heaviest scene, before changing anything. Editor runs carry debugger overhead.
- **Debugger > Profiler:** Start, play the scenario, Stop. Columns:
  - **Self:** time inside the function, excluding callees. The main hotspot signal.
  - **Total:** including callees; finds expensive subtrees.
  - **Calls:** per-frame count. A cheap function called thousands of times still dominates.
- **Debugger > Visual Profiler:** CPU and GPU time per render pass. Use it to tell a GPU-bound frame (shadows, transparency, post effects) from a CPU-bound one.
- **Debugger > Monitors:** live graphs. Watch FPS, Process and Physics Process time, draw calls, video memory, Object Count and Orphan Nodes.
- A micro-timing: `var t := Time.get_ticks_usec()` ... `print(Time.get_ticks_usec() - t)`.

## Monitors from code

```gdscript
var fps := Performance.get_monitor(Performance.TIME_FPS)          # updated once per second
var objs := Performance.get_monitor(Performance.OBJECT_COUNT)
var orphans := Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)  # debug builds only
var draws := Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
var vram := Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED)
Performance.add_custom_monitor(&"game/enemies", func(): return get_tree().get_node_count_in_group(&"enemies"))
```

- `MEMORY_STATIC` and the orphan count return 0 in release exports.
- `RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)` returns 0 until two frames have rendered, and some of its counters only cover 3D.
- Custom monitors appear in the Monitors tab under their `category/name`; the callable must return a number of 0 or more.

## Script (GDScript) hot paths

| Hot spot | Fix |
| --- | --- |
| `$A/B/C` or `get_node()` each frame | Cache in `@onready var x: T = $A/B/C` |
| `load("res://...")` during play | `const X := preload("res://...")` at class scope, or load during a loading screen |
| Strings built or compared every frame | Compare `StringName` literals (`&"run"`); update labels only when the value changes, ideally from a signal |
| New `Array`/`Dictionary` per frame | Keep a member buffer and `clear()` it; use `PackedVector2Array` and friends for bulk numbers |
| Untyped variables in tight loops | Static types (`var v: Vector2`, `Array[Enemy]`) let the VM use typed instructions |
| `get_nodes_in_group()` every frame | Cache the list and refresh on spawn and despawn, or have members register themselves |
| Processing that has nothing to do | `set_process(false)` / `set_physics_process(false)` until needed; stop idle timers |
| `instantiate()` + `queue_free()` many times a second | Pool them (`references/patterns.md`) after the profiler shows the cost |

- GDScript objects are reference-counted (`RefCounted`) or manually freed (`Node`, `Object`); there is no garbage collector to tune and no `OS.gc()`. Allocation churn still costs time, so reuse buffers. Managed GC hitches only apply to C#; see `godot-csharp`.
- A signal emitted every physics frame for a value nobody reads each frame: throttle it or let the reader poll.
- Moving work from `_process` to `_physics_process` is not a speed-up by itself; it runs at the physics rate, which can be more often than the frame rate on slow machines.
- If a loop is still too slow after profiling and typing, move it to C# or GDExtension, or spread it across frames.

## Rendering

- 2D batching is automatic: consecutive items with the same texture and material are drawn together. Keep sibling draw order texture-coherent (atlases, shared materials) so batches are not broken.
- `CanvasGroup` does **not** batch. It draws its children through a backbuffer pass, which adds cost; use it only for its visual effect (group transparency, outlines).
- Share materials. `material_override = ShaderMaterial.new()` per instance, or editing `material` on one instance of a shared resource after `duplicate()`, breaks sharing; vary per instance with `instance shader_parameter` uniforms (3D) or vertex color / `modulate`.
- `VisibleOnScreenNotifier2D/3D` (or `VisibleOnScreenEnabler2D/3D`) pauses processing for off-screen nodes. It does not reduce draw calls; frustum culling already skips drawing off-screen objects.
- 3D: let the importer generate LODs, use `MultiMeshInstance3D` for thousands of identical meshes, occlusion culling for indoor scenes, and limit shadow-casting lights. Renderer choice and GI cost are in `references/3d-scene.md`.
- Textures: check import settings (`references/import-pipeline.md`); large uncompressed textures show up as climbing video memory.
- Particle and shader cost: `godot-shaders`.

## Hitches and frame pacing

- **First-use shader stutter:** a hitch the first time an effect, material or mesh appears, gone on the second playthrough. 4.4+ (Forward+ and Mobile): ubershaders plus pipeline precompilation at load time, which only works if the RenderingServer sees the mesh, material and feature while loading. So load and instance effects during the loading screen, not mid-play; turning on MSAA or adding a VoxelGI at runtime triggers recompiles. Check Monitors > Pipeline Compilations: Canvas (2D has no precompilation), Mesh, Surface, Draw (should stay 0), Specialization (background, no stutter).
- **Compatibility renderer:** no ubershaders. Spawn every mesh and effect in front of the camera for one frame during loading, behind an opaque `ColorRect`.
- **Shader Baker** (4.5+, export preset option, Forward+/Mobile only, not web or `--headless` exports, bakes only drivers the host OS supports): shortens first startup, does not fix in-game stutter. Details in `godot-export`. Keep `rendering/shader_compiler/shader_cache/enabled` on (default).
- **Frame cap:** `application/run/max_fps` (0 = uncapped, read at startup; `--max-fps` overrides) or `Engine.max_fps` at runtime. With V-Sync Enabled or Adaptive the cap cannot exceed the refresh rate; on VRR monitors a cap a little below the refresh rate (`r - r * r / 3600.0`) cuts input lag without tearing. Prefer it over `application/run/frame_delay_msec`.
- **V-Sync:** `display/window/vsync/vsync_mode` or `DisplayServer.window_set_vsync_mode()`; modes other than Enabled need Forward+ or Mobile. Disabling V-Sync hides small stutters at the cost of tearing; it does not help shader-compilation hitches.
- Uneven motion at a steady FPS is usually physics-versus-render tick mismatch, not cost: enable physics interpolation (`godot-physics`).

## Physics

- Simple shapes on moving bodies (capsule, box, convex hull); `ConcavePolygonShape3D` only on static geometry.
- Trim collision masks so each body tests only the layers it needs.
- Prefer one `Area2D/3D` overlap over many raycasts per frame; batch queries through `PhysicsDirectSpaceState`.
- Let rigid bodies sleep (`can_sleep`, the default).
- `physics/common/physics_ticks_per_second` (default 60) sets cost and responsiveness; enable physics interpolation rather than raising it for smoothness. Details: `godot-physics`.

## Memory and leaks

- Climbing Object Count or Orphan Nodes across scene reloads means nodes removed with `remove_child()` but never freed, or kept alive by a reference.
- `RefCounted` cycles (two objects holding each other) never free; break one side with a `WeakRef` or clear it on exit.
- Resources loaded by path are cached and shared; `duplicate()` when an instance needs its own copy.
- Free nodes with `queue_free()`; calling `free()` on a node that is mid-signal or mid-physics-callback crashes.

## Done check

- The profiler capture before and after the change, on the same scene and build.
- Object Count steady across two scene reloads.
- No new allocation or `load()` in `_process` / `_physics_process`.
