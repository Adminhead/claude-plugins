# godot-agent-skills (Qb-Lab)

https://github.com/Qb-Lab/godot-agent-skills · MIT (Copyright 2026 Qblab) · checked out at `7f94393` (2026-09-17)

## Purpose

A "control layer" for agents working in Godot 4.x. It targets three failure modes the author sees in generated GDScript: Godot 3 API leaking in (`yield`, `.instance()`, `export var`), corrupted `.tscn` files, and code that is never run. It ships 20 portable `SKILL.md` files plus Claude Code hooks that enforce the rules.

## Contents

- Godot guards: `godot4-api-guard` (Godot 3 to 4 renames), `godot-scene-surgery` (safe `.tscn`/`.tres` edits), `godot-verify` (run headless and read the output).
- Game process and review skills: `concept-eval`, `scope-control`, `loop-and-economy`, `game-feel-review`, `playtest-review`, `art-direction`, `asset-builder`, `asset-review`, `market-scan`, `streamability`, `design-record`.
- Workflow skills: `build-loop`, `write-plan`, `grill-me`, `session-handoff`, `codex-review`, `using-godot-skills`.
- `hooks/hooks.json`: a scene guard hook.

## Use in this marketplace

A merge source only, per `docs/research/design-godot.md`. `godot` merged three of its skills: `godot-scene-surgery` became `references/tscn-tres-format.md` (updated for 4.6+), and `godot4-api-guard` and `godot-verify` fed the GDScript guidance and the headless verification step. The scene guard hook was skipped because it contradicts the pack's own scene-surgery skill. The process and workflow skills overlap `programming-core`, `planning`, `handoff` and the `game-*` plugins.

`plugins/godot/NOTICE` records the commit; `scripts/plugins.py upstream godot` reports upstream changes since then.
