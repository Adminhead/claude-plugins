# android-skills

Source: https://github.com/android/skills · License: Apache-2.0 · Last commit: 2026-10-29 (`6daa53ef`, "Bump plugin version to v1.0.19"; pinned for the paired suite) · Catalog: [catalog.md](catalog.md)

## Purpose

Google's Android skills for coding agents, in the Agent Skills format. The README describes them as AI-optimized instructions grounded in developer.android.com, aimed at workflows where evaluations show LLMs underperform. Areas covered: Jetpack Compose (adaptive, migration, performance, Ink), Navigation 3 and Navigation Event, Glance, Wear, XR, TV, Play (Engage, Billing, policy), camera (CameraX), device AI (LiteRT, ML Kit GenAI, AppFunctions), security, performance and ANR, testing, AGP 9 upgrade and the `android-cli` devtools skill. Installable with the Android CLI or as a Claude Code and Codex plugin.

## Layout

- `<area>/<name>/SKILL.md` for each skill, grouped by area (`jetpack-compose/`, `navigation/`, `wear/`, `play/`, and so on), some one level deeper (`device-ai/litert/litert-lm/`).
- `.claude-plugin/` and `.codex-plugin/` manifests plus `.agents/plugins/marketplace.json` at the root.
- `LICENSE.txt`, `README.md`, `.github/`.
- No agents, commands, hooks, MCP servers or LSP declarations.

## Counts

- 1 marketplace, 1 plugin (Claude and Codex manifests), 36 skills, nothing else.

## Quality notes

- Upstream keeps a strong bias toward evaluated gaps, so the skills are narrower than a general Compose guide.
- 32 of the 36 skills ship a `references/` directory; the other four are single-file.
- This clone was not run. The counts come from reading the tree.

## Use in this marketplace

`android-meta` depends on the `android-skills` marketplace (`android/skills`), so the skills are used as upstream and are not copied into `plugins/`. The dependency tracks upstream HEAD (unpinned) and is re-reviewed by hand. The clone is pinned at `6daa53ef` for the paired eval suite; `3rd-party/android-skills` is gitignored.
