# Batch gamedev-5a report

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `game-ai` | skill (direct install) | Engine-agnostic game AI skill: NPC and enemy decisions with FSMs, behavior trees and utility AI, steering and flocking, A*, flow fields and navmeshes in concept, perception and difficulty knobs. | awesome-gamedev-agent-skills @ 0a70cfc6 (Apache-2.0): `disciplines/game-ai` (+2 refs), `disciplines/ai-behavior-trees-utility-ai` (+4 refs) | none |
| `game-genres` | skill (direct install) | Engine-agnostic genre playbooks: core systems, data model, feel targets, balancing norms and pitfalls for platformers, roguelikes, card games, puzzles, RPGs, FPS, tower defense, survival-crafting and visual novels, plus branching dialogue (Ink, Yarn Spinner, custom runners). | awesome-gamedev-agent-skills @ 0a70cfc6 (Apache-2.0): 9 `genres/*` + `disciplines/dialogue-systems`; GodotPrompter @ bd9d1800 (MIT): `dialogue-system` (Godot notes only) | none |

Layout:
- `plugins/game-ai/`: `.claude-plugin/plugin.json`, `LICENSE` (Apache-2.0), `NOTICE`, `skills/game-ai/SKILL.md` (125 lines), `references/behavior-trees.md` (113), `references/utility-ai.md` (92), `references/pathfinding.md` (75), `evals/` (3 cases).
- `plugins/game-genres/`: `.claude-plugin/plugin.json`, `LICENSE` (Apache-2.0), `LICENSE-MIT` (GodotPrompter), `NOTICE`, `skills/game-genres/SKILL.md` (47 lines, router), 10 references (platformer, roguelike, card-game, puzzle, rpg, fps, tower-defense, survival-crafting, visual-novel, dialogue; 77 to 92 lines each), `evals/` (3 cases).

NOTICEs use the required `Upstream: <url> @ <full sha>` + `Paths: ...` lines (one block per source in game-genres).

## Validation

- `claude plugin validate --strict plugins/game-ai`: passed.
- `claude plugin validate --strict plugins/game-genres`: passed.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py` on both skills: valid.
- Grep for old names (codegraph, claude-mem, coding-core:, github:, Efficient, unity-/unreal-/old upstream skill names): no matches in skill bodies (only the attribution line names upstream `dialogue-systems`).
- Evals written but not run (`claude plugin eval` not run in this batch). Each plugin has two trigger cases with a hard-negative grader against the sibling, plus one near-miss negative case (game-ai: platformer jump feel; game-genres: BT RUNNING bug).

## Deviations from the plan

- game-ai: BT + utility references cut from 839 to 205 lines (target about 250); pathfinding kept as a third reference (75 lines). C# runtime code replaced with language-neutral pseudocode. Added short authored sections on perception and difficulty knobs (design scope listed them; upstream had little). Godot NavigationAgent API and beehave/LimboAI by pointer only (`godot` navigation reference, `godot-addons`).
- game-genres: each reference has core systems, data model, feel targets, balancing norms, pitfalls, then an "Engine pointers" section. Procgen algorithms point to `level-design`, drop-table math to `game-design`, ability/effect/inventory architecture to `game-architecture` (per the review), so the roguelike and RPG references don't duplicate them.
- Fixed or added on port: the reactive-selector + memory-sequence trap (guard conditions skipped while an action is RUNNING); sliding-puzzle parity; maze-TD placement path check; effect stacking keyed by source; inventory registry folder scans breaking in exports; craft output lost to a full inventory; dialogue `set` applied on the transition. In the Godot dialogue notes, I dropped GodotPrompter's doubtful C# `Expression` claim (taking GDScript only), and I don't present `const_calls_only` as a sandbox.

## Verified

- Godot 4.7 class reference (Context7 `/godotengine/godot-docs/__branch__4.7`): `Expression.execute(inputs, base_instance, show_error, const_calls_only)`, `RichTextLabel.visible_characters` (-1 shows all, counts characters, not BBCode), `get_total_character_count()`.
- Yarn Spinner: 3.x is current (3.1 released, per yarnspinner.dev, 2026).

## Unverified / TODO

- Genre numbers (FPS TTK bands, FOV range, day-cycle lengths, TD HP growth, platformer feel values) are design norms from upstream or common practice, worded as starting points, not checked against a source.
- Cross-references name sibling references that other batches are writing (`godot` navigation/2D/UI/save-and-config/camera references, `level-design` procgen, `game-design` economy/balancing, `game-architecture` patterns/save). Check that these names match once those batches land.
- Godot `AStarGrid2D`, `Path2D`/`PathFollow2D` were named from knowledge (they exist in 4.x), not rechecked.

## Suggested follow-ups

- Run `claude plugin eval plugins/game-ai` and `plugins/game-genres` with gamedev-core installed to check the layered pairs (game-genres versus game-design and game-feel; game-ai versus game-architecture FSM).
- `recommend-plugins`: suggest `game-genres` and `game-ai` in any game repo (project.godot and the like).
