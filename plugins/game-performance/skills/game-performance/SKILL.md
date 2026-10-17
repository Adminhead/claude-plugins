---
name: game-performance
description: Finds and fixes game frame-rate problems by measuring first, in any engine. Covers frame budgets, profiling a release build on target hardware, CPU versus GPU triage, draw calls and batching, overdraw, allocation and GC hitches, pooling and asset budgets. Use for "low FPS", "stutter", "hitches", "frame drops" or "frame budget".
---

# Game performance

Performance work is measurement: profile, find the one biggest cost, fix it, measure again. Don't change code for speed until a profile points at it. The intuitive culprit is usually wrong, and an unmeasured fix adds complexity for nothing.

Not for: the engine's profiler UI, monitors and rendering settings (for Godot, the `godot` skill's performance reference, if installed); physics jitter and tunneling (`game-feel`); restructuring code without a measured cost (`game-architecture`); slow non-game code such as tools, servers and build scripts (`problem-solving`).

## Workflow

1. **Set the target in milliseconds.** 60 FPS is 16.67 ms per frame, 30 is 33.3 ms, 120 is 8.33 ms, and a 90 Hz VR headset needs 11.1 ms. Name the target hardware (the minimum spec, a specific phone, a handheld).
2. **Reproduce the worst case.** Find a scene and an action that are slow every time, ideally scripted (a fixed seed, a fixed camera path). "Sometimes slow" can't be fixed; a repeatable spike can.
3. **Ask for or take a profile before guessing.** Use the engine profiler on a release or optimized build, on the target hardware. Editor and debug builds add overhead and skip optimizations, so they mislead. If you can only profile in the editor, say so in the report.
4. **Classify the cost** before choosing a fix: GPU (rendering), CPU in scripts or game logic, physics, CPU-side rendering submission, memory and garbage collection, or loading and I/O. Then decide whether the problem is a steady low frame rate or occasional spikes (hitches). They have different causes.
5. **Fix the single biggest cost.** Prefer doing less work (cull, cache, spatially partition, run less often, cut an O(n²) loop) over polishing a hot line.
6. **Re-measure on the same scene and hardware.** Keep the change only if the number moved. If it didn't, revert it and classify again.
7. **Lock it in** with budgets and a regression check (below).
8. **Report measured numbers:** before and after frame time (average and worst percentile), the bottleneck found and the fix. Never write "should be faster".

## CPU or GPU

- The slower of the CPU frame and the GPU frame sets the frame rate, because they run in parallel.
- **GPU-bound** (GPU time well above CPU time, or the frame rate rises when you lower the resolution): attack draw calls, overdraw, shader cost, resolution, lights and shadows, post-processing.
- **CPU-bound** (frame rate unchanged at a lower resolution): attack scripts, physics, pathfinding, allocations, node or entity counts, and rendering submission.
- Fixing the wrong side changes nothing. A GPU-bound game doesn't speed up with faster scripts.
- Starting budget at 60 FPS: gameplay and scripts about 5 ms, physics about 3 ms, render submission about 4 ms, UI and other about 2 ms, and the rest as slack. Whichever subsystem blows its share is the target.

## Common fixes

- **Draw calls:** every change of material, texture or render state usually costs a draw call or breaks a batch. Atlas textures, share materials, use GPU instancing (multi-mesh) for repeated meshes, and mark static geometry static.
- **Overdraw:** large stacked transparent layers, particles and full-screen effects shade the same pixel many times. Shrink them, cut layers, or use opaque or alpha-cutout materials.
- **Lighting:** bake static lighting, cap the number of real-time shadow casters, and lower shadow distance and resolution.
- **Do less:** frustum and occlusion culling, LOD, update distant AI less often, time-slice expensive checks across frames, use spatial partitioning for queries.
- **Pooling:** reuse bullets, particles and damage numbers instead of creating and destroying them in hot loops. Pre-warm the pool at load.
- **Allocations:** no new arrays, dictionaries, strings or closures per frame in hot code. Reuse buffers.

## Hitches (spikes in an otherwise smooth game)

- Look at the worst frames, not the average: track the 1% low or the 99th-percentile frame time. An average FPS can look fine while the game stutters.
- **Garbage collection** in managed runtimes (C#, Java, JavaScript, Lua) pauses a frame when the heap fills. Aim for zero allocation per frame in steady state.
- **Reference-counted scripting** frees memory immediately, so there's no GC pause, but freeing a large object graph at once (unloading a level, clearing a huge array) still spikes. Spread it out, and watch for reference cycles that leak instead.
- **Shader or pipeline compilation** on first use hitches the first time an effect appears. Pre-warm shaders behind a loading screen, or use the engine's pipeline cache or shader baking.
- **Loading on the main thread** (instantiating a big scene, decoding a texture) hitches. Load asynchronously ahead of need.
- **First-use instantiation:** the first enemy of a type or the first explosion builds caches. Pre-warm during loading.
- **Frame pacing:** an uneven frame cadence (16, 33, 16 ms) feels worse than a steady lower rate. Cap the frame rate below what the hardware can sustain, and check vsync settings.

## Budgets and regression checks

- Write budgets per subsystem in milliseconds, and asset budgets: texture sizes, triangle counts, draw calls per frame, real-time light count, memory.
- Add a benchmark scene with a fixed seed and camera path that records frame times (average, 95th and 99th percentile) and fails when they cross a threshold. Run it on consistent hardware; frame times from shared CI runners are noisy, so compare against a baseline with a tolerance.
- Mobile and handhelds throttle under heat. A game that holds 60 FPS for two minutes then drops is overheating. Test sustained play for 10 minutes or more, cap the frame rate and leave headroom.

## Gotchas

- Profilers have overhead. Deep or instrumented profiling inflates small, frequently called functions. Confirm a hotspot with a cheaper sampling pass or a timer before rewriting it.
- Vsync hides headroom. Turn it off while measuring, or the frame time reads as the refresh interval whatever the real cost.
- Don't optimize a prototype that isn't fun yet. Set the budget early and measure, but restructure only when the numbers demand it.
- Moving work to a thread helps only if the work is independent. Most engines' scene objects can't be touched from worker threads; compute on plain data, then apply the result on the main thread.

## References

- `references/profiling-and-budgets.md`: the triage flow, profiler quick-starts for common engines, the pooling manager, batching and instancing rules, allocation guidance, do-less techniques, asset budget tables and the regression-check recipe.

## Related skills

- `godot`: Godot's profiler, monitors and rendering settings, if installed.
- `game-architecture`: pooling, update order and data layout.
- `game-feel`: physics interpolation and jitter, which are not frame-rate problems.
- `level-design`: spreading procedural generation across frames.
