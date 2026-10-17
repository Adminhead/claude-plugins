# Profiling and budgets

Engine-neutral method, with short pointers per engine. Engine menu names and API change between versions, so check them in the engine's docs or the engine skill (for Godot, the `godot` skill's performance reference, if installed).

## Contents

1. Triage flow
2. What to capture
3. Profiler quick-starts
4. Pooling manager
5. Batching and instancing
6. Allocations and memory
7. Do-less techniques
8. Asset budgets
9. Regression check recipe

## 1. Triage flow

```text
1. Read the frame time against the budget (16.67 ms at 60 FPS).
2. Steady slowness or spikes?
     spikes  -> find the spiking frame in the timeline; see section 6 and the
                hitch list in the main skill
     steady  -> continue
3. Compare CPU frame time and GPU frame time:
     GPU >> CPU  -> GPU-bound: draw calls, overdraw, shaders, resolution, lights
     CPU >> GPU  -> CPU-bound: scripts, physics, pathfinding, allocation, entity count
     both close  -> check resolution scaling and the top CPU function; fix the cheaper win
4. Within the bound side, sort costs in descending order and attack only the top one.
5. Re-measure. If the frame time didn't move, revert and go back to step 3.
```

Quick discriminators:

- Halve the render resolution. If the frame rate jumps, the game is GPU-bound (fill rate or pixel shading).
- Disable rendering of a heavy layer, or all particles. If it barely changes, rendering isn't the problem.
- Freeze AI or physics with a debug toggle. Big gains point at that system.

## 2. What to capture

- Frame time per frame (not FPS), with average, 95th and 99th percentiles and the maximum, over a fixed scripted run.
- The CPU breakdown by system (scripts, physics, rendering submission, audio, UI).
- GPU time, and per-pass time if the tool shows it.
- Draw calls, primitives and visible object counts per frame.
- Memory: total, texture or video memory, and allocations per frame.
- The build type, the hardware and the settings used. Numbers without these are not comparable.

## 3. Profiler quick-starts

- **Godot:** the editor debugger's Profiler and Visual Profiler, the Monitors tab, and in-code performance monitors. See the `godot` skill for current names, the monitor constants and Godot-specific fixes.
- **Unity:** the Profiler window (CPU, GPU, rendering and memory modules) attached to a development build on the device, and the Frame Debugger for draw calls and batching. Deep Profile has heavy overhead.
- **Unreal:** `stat unit` (frame, game, draw and GPU times), `stat gpu`, `stat scenerendering`, and Unreal Insights for full traces.
- **Any engine:** a platform GPU profiler (RenderDoc for frame captures, PIX, Xcode Instruments, Android GPU Inspector, vendor tools) for GPU detail; and a CPU sampling profiler for native code.

Build an in-game overlay that shows frame time, the CPU and GPU split and draw calls, so testers can report numbers instead of "it felt slow".

## 4. Pooling manager

```text
Pool(create, reset, cap):
    free = []
    prewarm(n): repeat n: free.push(deactivate(create()))   # during loading
    acquire():  obj = free.pop() or create_or_recycle(); reset(obj); activate(obj); return obj
    release(obj): deactivate(obj); free.push(obj)            # never destroy
```

- Pool anything spawned often and briefly: bullets, shell casings, particles, damage numbers, audio one-shots, enemies in waves.
- Deactivation must stop processing, collision and drawing, not just hide the object.
- Cap the pool and choose an overflow policy: grow, refuse, or recycle the oldest.
- `game-architecture` covers generation handles for references that outlive a release.

## 5. Batching and instancing

- **What breaks a batch:** a different material, texture, shader or render state between consecutive objects, and sometimes a different draw order layer. Share materials and atlas textures so runs of objects submit together.
- **Many identical meshes:** GPU instancing (multi-mesh, instanced static mesh). One draw call for thousands of grass blades, rocks or bullets.
- **Static geometry:** mark it static or merge it, and bake lighting where nothing moves.
- **2D:** atlases and a shared material keep sprites batched. Per-sprite materials, shader parameters or effects that render to an offscreen buffer break batches. Check the engine docs for which 2D features force a separate pass.
- **UI:** keep frequently changing elements separate from static ones, so one changing label doesn't rebuild the whole canvas.
- **Lights and shadows:** each real-time shadow-casting light can render the scene again. Cap them, cull small shadows and shorten shadow distance.
- Measure draw calls before and after. Both the count and the GPU or submission time should fall.

## 6. Allocations and memory

- **Managed languages (C#, Java, JavaScript, Lua):** no `new` per frame in hot paths, no LINQ or closure allocation in update loops, no boxing (value types as object or interface), reuse lists with `clear()`, use non-allocating physics query variants, cache component lookups, and build strings rarely. Target zero bytes allocated per frame in steady state, and check it with the profiler's allocation view.
- **Reference-counted scripting:** no GC pause, but creating and freeing many temporary arrays and dictionaries per frame still costs time. Reuse them, prefer typed or packed arrays for bulk data, and free large structures gradually.
- **Native code:** watch for allocator churn in hot loops; use arenas or pools for per-frame scratch data.
- **Memory budgets:** textures dominate. Compress them in GPU formats, generate mipmaps for 3D, and keep resolution in proportion to on-screen size. Stream music; keep short sound effects in memory.
- **Leaks:** watch the object and node counts across repeated level loads. A count that climbs each cycle is a leak (an orphaned object, a lingering connection, a reference cycle).

## 7. Do-less techniques

- **Run less often:** update AI, perception and HUD on timers or every N frames, and stagger entities across frames so they don't all update on the same one.
- **Spatial partitioning:** a grid, quadtree or octree so queries touch only nearby objects, not all N. Use the physics engine's broadphase queries rather than looping over every entity.
- **Collision layers:** narrow what checks against what. Every unnecessary pair costs broadphase and narrowphase time.
- **Sleeping bodies:** let resting physics bodies sleep.
- **LOD and culling:** lower detail with distance, cull outside the view, and despawn or freeze entities far off-screen.
- **Cache:** memoize pathfinding, line-of-sight and derived values, and invalidate on change.
- **Amortize:** spread procedural generation, loading and bulk operations across frames or worker threads.

## 8. Asset budgets

Starting points; set real numbers from your own target hardware.

| Asset | Desktop | Mobile | Notes |
| --- | --- | --- | --- |
| Texture max size | 2048 to 4096 | 1024 to 2048 | GPU-compressed; mipmaps for 3D |
| Hero character triangles | 30k to 80k | 5k to 20k | LODs for distance |
| Draw calls per frame | low thousands | a few hundred | matters most on mobile |
| Real-time lights | a few | 1 or 2 plus baked | bake the rest |
| Real-time shadow casters | a few | 0 or 1 | shadows re-render the scene |
| Audio | streamed music, short SFX in memory | same | don't decompress everything at load |

Write the budgets down where artists see them, and check imports against them (a script or an import report that flags oversized textures and meshes).

## 9. Regression check recipe

1. A benchmark scene or scripted flythrough with a fixed seed, fixed camera path and fixed settings.
2. Run it in a release build on dedicated or at least consistent hardware, with vsync off and a warm-up period discarded.
3. Record frame times and report average, 95th and 99th percentiles, maximum, draw calls and peak memory.
4. Compare against a stored baseline with a tolerance (for example fail on more than 10% regression in the 95th percentile), because run-to-run noise is real.
5. Update the baseline deliberately, in its own commit, when a change is accepted.
6. On mobile, add a sustained run (10 minutes or more) and record whether the frame rate drops as the device heats up.
