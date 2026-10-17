---
name: level-design
description: Designs and builds game levels in any engine. Covers player metrics, blockout to playable, critical path and gating, pacing and tension curves, encounters and readability, plus seeded procedural generation (noise, rooms and corridors, BSP, cellular caves, WFC). Use for "level design", "blockout", "pacing", "encounter" or "procedural dungeon".
---

# Level design

A level is a sequence of intended experiences delivered through space. Build it in this order: metrics, blockout, play, fix, and only then dress. Authored and procedural levels follow the same rules. A generator still needs metrics, a critical path, pacing and a validation pass.

Not for: tile, grid-map or terrain API (for Godot, use the `godot` skill if installed); movement and jump tuning (`game-feel`); enemy behaviour (`game-ai`); loot tables, economy and difficulty balance (`game-design`); genre conventions (`game-genres`).

## Workflow

1. **Lock the metrics.** Measure the character: run speed, maximum jump height and distance (standing and running), reach, crouch height, and how much of the level the camera shows. Keep them as named constants next to the level data. Every gap, ledge, door and corridor is sized in these units. If the jump changes, re-derive the gaps.
2. **Write the beat list before building rooms.** For each room or section give a type (teach, practice, combat, puzzle, rest, reward, climax) and an intended intensity from 0 to 1. Read the intensity column: it should rise in a sawtooth, never flatline high or low.
3. **Model the critical path as a graph.** Rooms are nodes, and connections carry their gates (key, ability, switch, one-way). Validate it before building geometry (see below).
4. **Blockout.** Build the whole level from untextured primitives at the correct scale. Check flow, sightlines and reachability while changes are cheap. Do not add art.
5. **Play it, and watch someone else play it.** Note where players get lost, stuck, bored or killed unfairly. Fix the blockout. Getting lost is usually fixed with guidance (a light, a sightline, a landmark), not a wall.
6. **Dress only once it plays well.** Art can't rescue a bad layout, and detailing a layout that later changes wastes the most expensive work.
7. **Report** what was validated (metrics, path graph, playtest notes) and what wasn't.

## Metrics

```text
RUN_SPEED     = 240        # units/s
MAX_JUMP_H    = 96         # peak of a full jump
MAX_JUMP_DIST = 200        # running jump, horizontal
SAFE_GAP      = MAX_JUMP_DIST * 0.7    # required jumps: comfortable
HARD_GAP      = MAX_JUMP_DIST * 0.95   # optional skill checks only
```

- Required traversal uses safe values. Reserve near-limit jumps for optional rewards.
- Corridors are sized for the character and the camera, not just the collider. A 3D third-person camera needs room behind the player.
- Keep a metrics test room (gap ladder, ledge heights, slopes) in the project and re-run it whenever movement changes.
- On a grid, pick a cell size that divides the metrics evenly (for example a jump of 3 tiles high and 5 wide), so the grid itself enforces fair geometry.

## Critical path and gating

- **Critical path:** the shortest route from start to goal. It must be solvable with the keys and abilities obtained in order.
- **Golden path:** the route most players will actually take. Pace along this one.
- **Branches:** optional loops that reward the detour and rejoin the golden path quickly. Shortcuts that unlock back to a hub reduce backtracking fatigue.
- **Gates:** locks and keys (explicit), ability gates (revisit later), one-way drops (telegraph them), and soft gates (hazards or enemies that say "not yet").
- **Validate the order**, not just the connectivity: a flood fill from the start that crosses a gate only once its requirement has been collected. If the goal isn't reached, there is a soft-lock. Re-run the check after every layout change. For a generated level, run it on every seed.

## Pacing and teaching

- Introduce, develop, twist, test. Each new mechanic first appears where failure is harmless, then combines with something known, then appears in a new context, and only then is tested under pressure.
- Intensity rises in a sawtooth: spikes separated by rests, with each peak a little higher than the last.
- Put a clear rest (a save point, a vista, a resource cache) right before the hardest beat.
- Read `references/pacing-encounters.md` for tension curves, encounter building blocks, arena layout, readability techniques and the blockout review checklist.

## Procedural generation

- One seeded RNG per generator, passed explicitly. Never use the global random function in generation code.
- Derive a sub-seed per system (layout, loot, decoration) from the world seed, so a change in one system doesn't reshuffle the others.
- Generate into a plain grid or graph first, render it in a separate pass.
- Validate every result: reachability from spawn, a path to the exit, a safe spawn, and no key behind its own lock. Repair or reject a failed result, with a bounded retry count.
- Tune with the seed fixed, then sweep many seeds and check the distribution, not one lucky map.
- Store the seed in the save so the world can be regenerated.
- Read `references/procgen.md` for seeding and determinism rules, noise and fBm, rooms and corridors, BSP, drunkard's walk, cellular-automata caves, wave function collapse and spreading the work across frames.

## Gotchas

- Hand-placed content in a procedural game (boss rooms, set pieces) is authored separately and stitched in by the generator. Generation gives variety, not authored pacing.
- An unbounded "keep trying until N rooms fit" loop can spin forever on a small map. Cap the attempts and accept fewer rooms.
- One-way drops and collapsing paths need a telegraph, and a check that the player can't be stranded below without the ability needed to continue.
- Off-screen threats in 2D need warning (audio, approach time) or hits feel unfair.
- In 3D, landmarks visible from far away matter more than in 2D, because players lose orientation in three dimensions.

## References

- `references/pacing-encounters.md`: tension curves, the teaching loop, encounter design and arenas, readability and guidance, 2D versus 3D layout, and the blockout review checklist.
- `references/procgen.md`: seeded RNG and determinism, noise, dungeon algorithms, cellular automata, WFC, validation and performance.

## Related skills

- `godot`: TileMapLayer, GridMap, noise and RNG API in Godot, if installed.
- `game-feel`: the movement values the metrics come from.
- `game-ai`: enemies and navigation in the spaces built here.
- `game-design`: loot tables, economy and difficulty balance.
- `game-playtest`: running the playtests that drive iteration.
