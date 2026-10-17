# Batch gamedev-3 report (gamedev-core part 1)

## Plugins created

| name | type | description (= plugin.json) | sources | deps |
|---|---|---|---|---|
| game-feel | skill + 3 refs (input.md, camera.md, juice.md) | Engine-agnostic game feel: input buffering, coyote time, variable jump, deadzones, rebinding, camera follow, look-ahead and shake, hit-stop, tweens, squash and stretch, knockback and render jitter. | awesome-gamedev-agent-skills @ 0a70cfc (disciplines/game-feel, camera-systems, input-systems, physics-tuning feel half), Apache-2.0; GodotPrompter @ bd9d180 (camera-system: trauma shake, eased look-ahead), MIT | none |
| level-design | skill + 2 refs (pacing-encounters.md, procgen.md) | Engine-agnostic level design: player metrics, blockout to playable, critical path and gating, pacing and tension curves, encounters, readability, and seeded procedural generation (noise, rooms and corridors, BSP, cellular caves, WFC). | upstream disciplines/level-design, procedural-gen (generation half, loot tables left for game-design); GodotPrompter procedural-generation (CA, WFC) | none |
| game-architecture | skill + 2 refs (patterns.md, save-systems.md) | Engine-agnostic game code structure: game loop and fixed timestep, state machines (flat, hierarchical, parallel), composition, event bus, object pools, data-driven content, inventory and ability systems, scene flow and save systems. | upstream disciplines/save-systems, physics-tuning timestep half; GodotPrompter state-machine, inventory-system, ability-system, save-load (.tres-security rule only) | none |
| game-performance | skill + 1 ref (profiling-and-budgets.md) | Engine-agnostic game performance, measured first: frame budgets, profiling a release build on target hardware, CPU versus GPU triage, draw calls and batching, overdraw, allocation and GC hitches, pooling, asset budgets and regression checks. | upstream disciplines/performance-optimization | none |

Each plugin ships `LICENSE` (Apache-2.0 text) and `NOTICE` (upstream NOTICE copyright, `Upstream: <url> @ <sha>` + `Paths:` lines per source, modifications). game-feel, level-design and game-architecture also ship `LICENSE-MIT` (Copyright (c) 2026 GodotPrompter Contributors). SKILL.md sizes: 82, 81, 81, 72 lines; descriptions 329 to 345 chars. No engine API or engine versions in any file; pointers to `godot` / `godot-physics` "if installed".

Evals added (not run): 2 per plugin under `plugins/<name>/evals/` (one trigger case, one routing or negative case against a sibling in this batch; cross-plugin graders are negatives only, so they pass when the sibling isn't installed).

## Validation

- `claude plugin validate --strict plugins/{game-feel,level-design,game-architecture,game-performance}`: all pass.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py` on each skill: all valid.
- Grep for codegraph, claude-mem, coding-core:, github:, "Efficient ", old upstream skill names (godot-tilemap, camera-systems, ...), and "Godot 4.x"/version strings: none outside NOTICE.
- Cross-references used all exist as plugin dirs: godot, godot-physics, game-ai, game-design, game-ui, game-audio, game-playtest, game-genres, coding, problem-solving. godot's camera.md and performance.md exist (pointers resolve).

## Fixes applied on port (from the review)

- Smoothing uses `1 - exp(-rate*dt)`; GodotPrompter's `lerp(k*delta)` dropped. Camera-roll-ignored-by-default pitfall stated engine-neutrally (upstream game-feel's shake sample had the same Camera2D rotation bug).
- Input: no claim that just-pressed misses inputs in the physics step; says check whether the engine query is tick-aware.
- WFC: contradiction detected during propagation (GP sample skipped zero-option cells and could report success with holes).
- HSM: nested machine enters and takes input only while the parent is active.
- Inventory: registry from an explicit list, not a directory scan (breaks in exports); save by id, never resource path.
- Abilities: cast_time enforced via a casting state; effects keyed by (id, source) with explicit stacking policy; tags counted.

## Deviations

- Physics feel (jitter, interpolation, CCD, mass vs fall speed) went into game-feel's body, not a reference; the accumulator loop went into game-architecture/references/patterns.md.
- Inventory and ability sections are ~25 and ~35 lines, shorter than the ~60 suggested.
- game-performance has no GodotPrompter content (the profiler agent's "capture before guessing" rule is reflected as an idea only), so no LICENSE-MIT there, matching the review's list.

## Godot-specific notes for the coordinator (not edited; `godot` belongs to another batch)

1. `godot/references/performance.md` has no shader/pipeline-compilation hitch guidance (ubershaders and pipeline cache, Shader Baker), no frame cap (`application/run/max_fps`) and no frame-pacing/vsync note. Verify the versions before adding.
2. Hit-stop in Godot: `get_tree().create_timer(duration, true, false, true)` (4th arg `ignore_time_scale`) and `Engine.time_scale`; worth a line in `godot/references/animation.md` or `patterns.md`. Unverified by me.
3. `godot/references/camera.md` already covers `ignore_rotation`, exp smoothing and `get_global_transform_interpolated()`. No action needed.
4. Engine-neutral layering notes for godot-physics: jump-from-height formulas (`g = 2h/t^2`, `v0 = 2h/t`) live in game-feel; godot-physics can point there instead of repeating them.

## Unverified / TODO

- Evals written but not run (`claude plugin eval`); run them with the full godot-meta for layered pairs.
- Numeric starting values (buffer/coyote windows, trauma, budgets) are design heuristics carried from upstream, not engine facts; no version checks were needed since no engine API is kept.

## Suggested follow-ups

- Register the four plugins in marketplace.json and in gamedev-core's dependencies.
- Add a game-feel vs godot-physics routing eval once both are registered.
