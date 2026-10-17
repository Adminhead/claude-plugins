# jame581/GodotPrompter

Source: https://github.com/jame581/GodotPrompter · License: MIT (Copyright 2026 GodotPrompter Contributors) · Last commit: 2026-10-14 (`docs(export-pipeline): add Steam release planning reference`, merge of PR #32) · Release: v1.15.1 (2026-10-12) · Catalog: [catalog.md](catalog.md)

## Purpose

Jan Mesarč's "agentic skills framework for Godot 4.x": 56 domain skills, 9 agents and a SessionStart hook, built on top of obra/superpowers conventions. Every skill targets Godot 4.3+ with GDScript and C# side by side, and marks newer features (4.5 to 4.7) as annotated additive sections. Beyond engine topics it ships process skills (brainstorming, a design "grill", code review, a teaching "mentor" mode) and five third-party addon skills (LimboAI, Beehave, Popochiu, Dialogue Manager, Phantom Camera) with pinned addon versions. Created 2026-04-03; 845 stars, 52 forks at survey time.

## Layout

- `.claude-plugin/plugin.json` and `marketplace.json`: one plugin, `godot-prompter` 1.15.1, marketplace `godot-prompter-marketplace`. The README now points new users at the author's `jame581/skillsmith` marketplace; the separate `godot-prompter-marketplace` repo is legacy.
- `skills/` (56 skills, 202 reference files, about 15,900 SKILL.md lines plus 25,000 reference lines): one folder per skill, `SKILL.md` capped at 16 KB by the validator, depth moved to `references/`. `skills/index.json` is a generated machine-readable catalog.
- `agents/` (9): architect, game-dev, code-reviewer, shader-author, performance-profiler, animator, csharp-engineer, ui-designer, tools-engineer. `.codex/agents/` mirrors them.
- `hooks/`: `hooks.json`, a polyglot `run-hook.cmd` and a bash `session-start` that finds `project.godot` (4 levels up, 3 down), reads the engine version and renderer, and injects the `SESSION-CARD` region of `using-godot-prompter` (plus `MENTOR-CARD` when mentor mode is on). Mentor and "add a GodotPrompter section to CLAUDE.md" refusals are stored in `~/.godot-prompter/state/`.
- `.cursor-plugin/`, `.codex/`, `.opencode/`, `docs/platforms/`: other-harness packaging.
- `evals/` (`claude plugin eval` suites for mentor, grill and 14 domain cases, with results in `SKILLS.md`, `GRILL.md`, `FOLLOWUPS.md`), `tests/` (hook tests, validator tests, a manual agent-integration plan), `scripts/` (Node validator, token counter, index generator, version bump).
- `.claude/skills/`: two maintainer skills (authoring and releasing GodotPrompter skills), not shipped.
- `docs/superpowers/`: plans, specs and audit notes, including the 2026-10-11 Godot 4.7 callout audit.

## Counts

- 1 marketplace, 1 plugin, 56 shipped skills (the catalog's 66 adds 8 validator fixtures under `scripts/fixtures/` and the 2 maintainer skills).
- 9 agents (the catalog counts `agents/` only; `.codex/agents/` holds TOML mirrors).
- 0 commands, 1 hooks file (SessionStart).
- Descriptions are short "Use when ..." lines: median 140 characters, max about 400.

## Themes

| Theme | Skills |
|---|---|
| Core and process | using-godot-prompter, godot-project-setup, godot-brainstorming, godot-grill, godot-code-review, godot-debugging, godot-testing, godot-mentor |
| Architecture and patterns | scene-organization, state-machine, event-bus, component-system, resource-pattern, dependency-injection |
| Scripting | gdscript-patterns, gdscript-advanced, csharp-godot, csharp-signals |
| Physics, 2D, 3D, XR | physics-system, 2d-essentials, 3d-essentials, xr-development |
| Gameplay systems | player-controller, input-handling, animation-system, tween-animation, audio-system, inventory-system, dialogue-system, save-load, ai-navigation, ability-system, camera-system, localization, procedural-generation |
| UI | godot-ui, responsive-ui, hud-system |
| Multiplayer | multiplayer-basics, multiplayer-sync, dedicated-server |
| Rendering | shader-basics, particles-vfx |
| Build and deploy | export-pipeline, godot-optimization, addon-development, assets-pipeline, mobile-development |
| Native and threads | gdextension, multithreading |
| Math | math-essentials |
| Third-party addons | limboai, beehave, popochiu, dialogue-manager, phantom-camera |

## Install / use

From the README (Claude Code):

```bash
claude plugins marketplace add jame581/skillsmith
claude plugins install godot-prompter@skillsmith
```

From a local clone:

```bash
claude plugins marketplace add ./GodotPrompter
claude plugins install godot-prompter@godot-prompter
```

Also documented for Copilot CLI, Cursor, Codex (symlink into `~/.agents/skills`), OpenCode, Antigravity and Grok Build. Mentor mode is toggled by saying "teach me as we go" / "just give me the code".

## Highlights

- `skills/godot-testing/SKILL.md`: GUT versus gdUnit4 comparison, directory and naming conventions, mocking, headless CI runners.
- `skills/godot-debugging/SKILL.md`: print family, remote debugger, signal tracing, a common-error table.
- `skills/state-machine/SKILL.md`: enum, node-based and resource-based FSMs with a trade-off table (494 lines, the longest engine skill).
- `skills/save-load/SKILL.md`: ConfigFile, JSON and Resource saves, versioned migration, and why not to load untrusted `.tres` (88 lines, depth in references).
- `skills/physics-system/` (12 references): bodies, Jolt, ragdolls, physics interpolation.
- `skills/godot-code-review/SKILL.md`: a Godot-specific review checklist (500 lines).
- `skills/beehave`, `limboai`, `phantom-camera`, `popochiu`, `dialogue-manager`: addon APIs with pinned versions (Beehave 2.9.2, LimboAI 1.8.0, Phantom Camera 0.11.0.2, Popochiu 2.1.1, Dialogue Manager 3.10.4).
- `hooks/session-start`: a careful, bounded project finder (pruned `find`, depth caps), a useful pattern for any project-type hook.

## Quality notes

- Unusually well maintained for a community skill pack: a Node validator in CI (frontmatter, cross-refs, C# parity, 16 KB budget, an invented-API denylist), hook tests, eval suites run with and without the plugin, and a release workflow that blocks on version drift.
- v1.15.1 (2026-10-12) audited version claims and examples: GDScript parsed with Godot 4.7.2 and C# compiled against `Godot.NET.Sdk` 4.7.2. It fixed about 75 claims and 35 examples. Prose not tied to a version was not audited, and nothing was run in a game.
- The 4.5 to 4.7 callouts hold up when checked against the 4.7 docs. The errors are in older generic content the audit skipped. Examples: Godot 3 import flags in `assets-pipeline`; `print_debug()` described as "not visible in release" in `godot-debugging`; invented gdUnit4 CLI runners and GUT property stubs in `godot-testing`; CanvasGroup "batching" and `OS.gc()` in `godot-optimization`; `add_control_to_dock` (deprecated in 4.7) in `addon-development`; a `headless` feature tag in `dedicated-server`; Godot 4.3 pins in the `.csproj` and CI samples. `dialogue-manager` targets addon v3.10.4, but v4 (2026-08) renamed titles to cues.
- Skills are long: 88 to 500 lines, mostly 200 to 350, with GDScript and C# for most sections. Loading three of them for one feature costs 15k to 25k tokens. Most end with an implementation checklist.
- 56 model-invoked descriptions in one plugin crowd the skill listing, and several overlap (state-machine, ai-navigation, beehave and limboai all cover NPC decisions; godot-ui, responsive-ui and hud-system all cover Control UI).
- The SessionStart hook injects a card of up to 3 KB on every start and compaction in a Godot project, and offers to add a `## GodotPrompter` section to the project's agent instructions file. It reads `project.godot` and writes only under `~/.godot-prompter/state/`.
- Process skills (brainstorming, grill, mentor) and the agents duplicate general workflow that adminhead's `programming-core` and `planning` already provide.

## Relevance to adminhead

- A merge source, not a dependency, for the `godot-*` and `game-*` ports in `docs/research/design-godot.md`. The per-skill review lives with that design work.
- MIT: ship `LICENSE-MIT` naming "GodotPrompter Contributors" and the source skills at commit `bd9d180` in each plugin that merges content.
- Its 4.7.2-checked examples make it a good cross-check for the awesome-gamedev-agent-skills ports, especially for version callouts (4.5 to 4.7).
- The five addon skills are the only candidates for addon-specific plugins; their pinned versions need a recheck against each addon's latest release before porting.
- Don't port the SessionStart hook, the process skills or the agents; take the project-finder logic only as a reference if a Godot detection hook is ever needed (for `test-run` or `recommend-plugins`).
