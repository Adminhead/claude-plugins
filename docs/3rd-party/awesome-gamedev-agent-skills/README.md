# awesome-gamedev-agent-skills

Source: https://github.com/gamedev-skills/awesome-gamedev-agent-skills · License: Apache-2.0 · Last commit: 2026-10-09 (merge of PR #18, `bevy-0.20-migration`) · Catalog: [catalog.md](catalog.md)

## Purpose

A third-party collection of 74 game-development skills (plus one router skill) in the Agent Skills `SKILL.md` format. Each skill is a short markdown capability file that an agent loads only when a task matches: engine basics (Godot, Unity, Unreal, web engines, Bevy, pygame, LÖVE, Roblox), cross-engine disciplines (AI, audio, save systems, input, performance), genres, and shipping workflows (game jam, Steam, itch.io). The router detects the engine from project files and loads the matching skills.

## Layout

Local copy: `3rd-party/awesome-gamedev-agent-skills/` (gitignored in this repo).

```
.claude-plugin/   marketplace.json (one marketplace, 10 plugins)
router/           master router SKILL.md + references/ + agents/
skills/           godot/ unity/ unreal/ web-engines/ other-engines/
                  disciplines/ genres/ workflows/
docs/             SKILL-FORMAT.md, INSTALLATION.md, COMPATIBILITY.md, VERSION-SUPPORT.md
scripts/          validate-skills.py, generate-site.py, check-site.py
tests/            test_validate_skills.py, test_asset_tools.py
templates/        SKILL.md template
.github/workflows/ ci.yml (validator + tests), pages.yml
```

Each skill is a directory with `SKILL.md`, optionally with `references/` (deeper recipes loaded on demand), `agents/` (per-agent metadata), `assets/`, or `scripts/`.

## Counts

- 75 `SKILL.md` files: 74 skills and `router/SKILL.md`. Matches the README and catalog.
- 173 files under `skills/` in total.
- 68 `references/` directories (67 skills plus `router/`).
- 6 `agents/` directories, 1 `scripts/` directory (`create-game-assets` only).

Per-subdir counts from `find skills -name SKILL.md | awk`:

```
find skills router -name SKILL.md | awk -F/ '{print $2}' | sort | uniq -c | sort -rn
```

## Categories

| Category | Path | Skills | Versions pinned in the skills |
|---|---|---:|---|
| Godot | `skills/godot/` | 16 | Godot 4.7 |
| Disciplines (cross-engine) | `skills/disciplines/` | 15 | none (engine-neutral) |
| Other engines | `skills/other-engines/` | 10 | Bevy 0.19, pygame-ce 2.5.8, LÖVE 11.5, Roblox (7 skills) |
| Unity | `skills/unity/` | 8 | Unity 6.3 LTS (6000.3) |
| Genres | `skills/genres/` | 9 | none (engine-neutral) |
| Web engines | `skills/web-engines/` | 6 | Phaser 4.2, PixiJS 8.21, three.js r186 |
| Unreal | `skills/unreal/` | 6 | Unreal Engine 5.8 |
| Workflows | `skills/workflows/` | 4 | none |
| Router | `router/` | 1 | n/a |
| **Total** | | **75** | |

## Install / use

From the README (Claude Code plugin route; `npx` route works for any agent):

```bash
npx skills add gamedev-skills/awesome-gamedev-agent-skills

claude plugin marketplace add gamedev-skills/awesome-gamedev-agent-skills
claude plugin install gamedev@awesome-gamedev-agent-skills

# Smaller bundles: router plus one engine
claude plugin install router@awesome-gamedev-agent-skills
claude plugin install godot@awesome-gamedev-agent-skills    # or: unity · unreal · web-engines · other-engines
```

The `npx` CLI also takes `--list` (preview), `-g` (all projects) and `-a <agent>` (target one tool). Per-agent paths are in `docs/INSTALLATION.md` upstream.

## Highlights

- `skills/godot/godot-2d-movement/SKILL.md` - CharacterBody2D with `move_and_slide()` (4.x no-arg form), with a pitfalls list and `references/controller-recipes.md`.
- `skills/unity/unity-input-system/SKILL.md` - New Input System patterns, pitfalls, and `references/rebinding.md` for rebinding and local multiplayer.
- `skills/unreal/unreal-blueprints/SKILL.md` - Blueprint communication: Cast, Interfaces, Event Dispatchers, with tradeoffs.
- `skills/other-engines/roblox-datastores/SKILL.md` - pcall-guarded loads, `UpdateAsync`, `BindToClose`, and a detailed pitfalls list.
- `skills/other-engines/bevy-ecs/SKILL.md` - Bevy 0.19 ECS: components, resources, query filters, plugins; pins the Cargo version.
- `skills/web-engines/phaser-core/SKILL.md` - Phaser 4.2 scene lifecycle, scene transitions, cross-scene events, camera follow.
- `skills/disciplines/create-game-assets/` - the only skill with `scripts/` (Pillow-based `asset_report.py`, `build_preview_sheet.py`) and `assets/asset-manifest.json`.
- `skills/disciplines/game-ai/references/behavior-trees.md` - example of a discipline skill backed by a reference file.
- `router/SKILL.md` - engine detection and the task-to-skill routing table.
- `scripts/validate-skills.py` - stdlib-only validator for frontmatter and links, run in `.github/workflows/ci.yml`.

## Quality notes

Sampled 7 skills across Godot, Unity, Unreal, Bevy, Phaser, Roblox and disciplines, plus the create-game-assets helpers. Findings:

- Consistent structure: `When to use` / `Core workflow` / `Patterns` / `Pitfalls` / `References` / `Related skills`. Bodies run about 100-150 lines.
- Pitfalls are concrete and engine-specific (for example, `move_and_slide(velocity, Vector2.UP)` no longer parses in 4.x; `SetAsync` races between servers; `DataStoreKeyInfo` is nil for ordered stores). These are the main value.
- Depth is breadth-first. Deeper material is pushed into `references/`, so an agent loads more only when needed.
- Engine versions are pinned in headings and descriptions. These go stale as engines release; check `docs/VERSION-SUPPORT.md` upstream before relying on them.
- I did not verify API details against engine docs. Treat the code samples as unchecked.
- Tests cover the validator (9 test functions) and the asset helpers (3). Only the asset helpers need a third-party package (Pillow).
- Apache-2.0 with a `NOTICE` file. Keep attribution if any content is reused.

## Relevance to adminhead

- Useful reference for a multi-plugin marketplace layout: one `.claude-plugin/marketplace.json` listing 10 plugins plus a router, with bundles that install a router and one engine.
- The stdlib validator plus CI pattern (`scripts/validate-skills.py` in `ci.yml`) is a model for checking SKILL.md frontmatter and links in this repo's plugins.
- Not something to vendor into a plugin. Install it only for game work, into the user's own agent setup. Its version pins will need upkeep.
- Apache-2.0 allows reuse, but any copied content needs its `NOTICE` attribution.
