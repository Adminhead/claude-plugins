# Rescue review: game-genres

Every file was read in full: `plugins/game-genres/skills/game-genres/SKILL.md` (45 lines) and all 10 files under `references/` (card-game 85, dialogue 92, fps 90, platformer 87, puzzle 88, roguelike 81, rpg 83, survival-crafting 83, tower-defense 77, visual-novel 80). Live-plugin checks were grep runs over `plugins/` excluding the 10 deprecated plugins and any `evals/` or `results/` folders.

## Summary

1. One rescue item at most, and it is marginal: the `Expression.execute()` caveat (dialogue.md:92).
2. Proposed home: `godot-addons/skills/godot-addons/references/beehave.md`, next to line 120, which already says Beehave runs Inspector expressions through Godot's `Expression`.
3. Everything else is generic genre knowledge or already live (platformer feel numbers in `game-feel`/`godot-physics`, lag compensation in `godot-multiplayer`, mouse delta in `game-feel`, export-safe item registry in `godot`, AStarGrid2D in `godot`/`game-ai`, drop-table weights in `game-design`).
4. Two claims to NOT rescue as written: SKILL.md-adjacent dialogue.md:32 (Yarn undeclared variables, unverified) and fps.md:53 (FOV "horizontal", ambiguous in Godot).
5. Confidence: high that the other nine files have nothing worth moving; medium-low that the one item is worth moving at all (it sits near the bare-model-passes level).

## SKILL.md

Cross-genre checklist (core loop in one sentence, content as data, seeded RNG, run vs profile state, delta time). GENERIC, and the same advice is live in `game-architecture` and `game-prototype`. Note: the task brief cites "SKILL.md line 32" for the Yarn claim, but SKILL.md line 32 is the "prototype the core verb" item; the Yarn claim is at `references/dialogue.md:32`.

## references/card-game.md

- RESCUE: none.
- DUPLICATE: shuffle bias is textbook; `game-design/skills/game-design/references/economy.md:11` covers shuffle bags and pity for streak control.
- GENERIC: zone exclusivity, atomic play, queue vs stack resolution, trigger ordering, fizzle on invalid target, deckbuilder balance norms (5 cards / 3 energy is Slay the Spire, accurate).

## references/dialogue.md

- RESCUE (marginal): dialogue.md:92 "`execute()`'s `const_calls_only` flag restricts execution to const calls, but don't treat it as a sandbox". Together with line 92 "`Expression` can call any method reachable from the base instance". The whitelist-parser rule (line 52) is at the level the bare model already passes, so only the `const_calls_only` is-not-a-sandbox detail is new. The parameter does exist (`execute(inputs, base_instance, show_error, const_calls_only)`). grep for `const_calls_only` in live plugins: no hit. `Expression` is only mentioned live at `godot-addons/.../beehave.md:120`, with no security caveat.
- DUPLICATE: `visible_characters` typewriter without breaking BBCode: `godot/skills/godot/references/ui-control.md:69`. Dialogue Manager conditions/responses: `godot-addons/.../dialogue-manager.md:53-54`.
- GENERIC: Ink vs Yarn table, `*` vs `+` choices (Ink syntax, well known), custom runner graph, string tables, validation pass, typewriter UX, `set` applied against old values (so `{a: b, b: a}` swaps; borderline, not recommended).
- UNVERIFIED / possibly wrong: dialogue.md:32 "an undeclared one compiles with an inferred type and default, which hides typos". I cannot confirm this for Yarn Spinner 3.x; behaviour differs between 2.x and 3.x and may be a compile error or a runtime missing-default error. Do not rescue. Also dialogue.md:16 pins "Yarn Spinner (3.x)" and dialogue.md:25 "Godot (C#)" runtime claims, which I did not verify.

## references/fps.md

- RESCUE: none.
- DUPLICATE: lag compensation: `godot-multiplayer/.../sync-prediction.md:76`. Raw mouse delta not times dt: `game-feel/skills/game-feel/SKILL.md:64`, `references/input.md:87`. TTK tables: `game-design/.../balancing.md:78`.
- GENERIC: hitscan from camera, tracers from muzzle, tunneling, learnable recoil, falloff, TTK formula.
- Flag: fps.md:53 "80 to 100 degrees horizontal". Godot's `Camera3D.fov` is vertical by default (`keep_aspect`); the live `godot/.../camera.md:76` mentions `keep_aspect`. A model following this line could set the wrong number. Do not rescue as is.

## references/platformer.md

- RESCUE: none.
- DUPLICATE: coyote, buffer, cut, fall gravity: `game-feel/skills/game-feel/references/input.md` (corner correction at :70); `godot-physics/.../controllers.md` (jump buffer, one-way, moving platforms); delta-time/tunneling: `game-architecture/SKILL.md:24`.
- GENERIC: gravity/jump-velocity derivation, level teaching order, camera smoothing `1 - exp(-k*dt)` (well known).

## references/puzzle.md

- RESCUE: none. The parity rule at puzzle.md:51 is the eval-calibrated fame level.
- GENERIC: cascade loop, undo snapshots including RNG state, deadlock reshuffle, sokoban push rules and corner deadlocks, reverse generation.

## references/roguelike.md

- RESCUE: none.
- DUPLICATE: weights are relative, not percentages: `game-design/.../economy.md:50`. `AStarGrid2D` for grids: `godot/.../navigation.md:109`, `game-ai/.../pathfinding.md:58`. Procgen: `level-design` procgen reference.
- GENERIC: energy scheduler, Berlin Interpretation, FOV shadowcasting with symmetry, connectivity pass, save-scum prevention (delete the run save on load).

## references/rpg.md

- RESCUE: none.
- DUPLICATE: export-safe item registry (rpg.md:77): `godot/skills/godot/references/save-and-config.md:116` is more specific (`ResourceLoader.list_directory`, 4.4+).
- GENERIC: modifier layer order, derived stats not stored, subtractive vs ratio damage, XP curve families, quest state machine, save versioning.

## references/survival-crafting.md

- RESCUE: none.
- GENERIC: atomic crafting with overflow drop, tool tiers, need decay, incremental chunk saves, day length norms (Minecraft 20 min is accurate).

## references/tower-defense.md

- RESCUE: none.
- DUPLICATE: flow field once per placement: `game-ai/.../pathfinding.md:61` section; fixed-step and time-scale: `game-architecture/SKILL.md:24`, `game-feel/.../juice.md:50`.
- GENERIC: path-progress "first" targeting, spatial bucketing, DPS x time-in-range, geometric HP growth, sell ratio 0.7.

## references/visual-novel.md

- RESCUE: none.
- GENERIC: save-anywhere record, skip seen-only, auto-advance, backlog, branch-and-merge, localization expansion (30%).
- Note: Ink/Yarn "can both save and restore their state" (visual-novel.md:34) is true for Ink (`state.toJson`) and Yarn variable storage, but the details are not given, so nothing concrete to rescue.

## Rescue table

| Fact | Source | Proposed home | Text to add |
| --- | --- | --- | --- |
| `Expression.execute()` can call any method reachable from the base instance; `const_calls_only` limits it to const methods but is not a sandbox (marginal, low confidence) | `references/dialogue.md:92` | `plugins/godot-addons/skills/godot-addons/references/beehave.md`, after line 120 | "`Expression.execute()` can call any method reachable from its base instance, and `const_calls_only` restricts it to const methods without making it a sandbox. Only evaluate expression strings the project authored; for modded or downloaded text, write a whitelisted parser." |

Do-not-rescue list: dialogue.md:32 (Yarn undeclared variable inference, unverified), fps.md:53 (FOV "horizontal" is ambiguous in Godot).
