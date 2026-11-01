# chrisbanes-skills

Source: https://github.com/chrisbanes/skills · License: Apache-2.0 · Last commit: 2026-11-01 (`d059de16`, "Include a plan overview in deliver-spec approval requests (#137)"; pinned for the port) · Catalog: [catalog.md](catalog.md)

## Purpose

Chris Banes's skills for Kotlin, Jetpack Compose and Android development, plus grounded writing. The workflow skills (`deliver-spec`, `to-plan`, `shepherd`, `implement-with-subagents`, `run-github-project`) compose with skills from other repositories, which the README lists as external providers. Compose-specific skills cover state and effects, performance, component design, focus navigation, animations and UI testing. The repo is also a portable Agent Plugins v1.0.0 package.

## Layout

- `plugin.json` at the root, plus `.claude-plugin/`, `.codex-plugin/` and `.agents/` manifests for the same single plugin.
- `skills/<name>/`: `SKILL.md` plus `references/` where present. Skills live only under `skills/`.
- `skills/using-chrisbanes-skills/`: the router skill that links the others.
- `evals/`: an eval harness with cases, fixtures, validators and schemas.
- `tests/`, `scripts/`, `docs/`, `.opencode/`, `package.json`: tooling for the repo itself.
- No agents, commands, hooks, MCP servers or LSP declarations.

## Counts

- 1 plugin (three manifests), 20 skills, nothing else.
- Skill catalog: `deliver-spec` (11 files), `run-github-project` (24 files), `compose-performance`, `kotlin-api-design`, `kotlin-concurrency-and-flow`, `release-kotlin-library` and others; see [catalog.md](catalog.md).

## Quality notes

- The eval harness under `evals/` is the largest part of the repo (about 777 case files). This clone was not run; the counts are from reading the tree.
- Several workflow skills name external skills (Matt Pocock's `triage`, `tdd`, `wayfinder`, `research`) that the repo does not install. Ports must not assume them.
- The router skill and cross-skill links are not carried into `plugins/`, per the port rules in `docs/plans/android-meta.md`.

## Use in this marketplace

Port source for the Compose and Kotlin leaves in `docs/plans/android-meta.md`. The skills are not installed from here and nothing in `plugins/` depends on this repo. The clone is pinned at `d059de16` for the port; `3rd-party/chrisbanes-skills` is gitignored.
