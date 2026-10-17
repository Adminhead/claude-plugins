# ponytail

Source: https://github.com/DietrichGebert/ponytail · License: MIT (Copyright 2026 DietrichGebert) · Last commit: 2026-10-17 01:04 +0200, `chore: release v5.3.2 (#1153)` · Catalog: [catalog.md](catalog.md)

## Purpose

Ponytail is a prompt-based "lazy senior dev" mode for AI coding agents. Its core skill tells the agent to write the smallest change that fully solves the task: check what the codebase already has, prefer the standard library, and avoid unrequested abstractions. It also ships review, audit, debt-ledger and help commands, plus a Claude Code "band" (a status panel above the prompt) that tracks cost, time, tokens and reuse per task. The repo is the source for the same prompt across about 20 agent hosts.

## Layout

Top level: `.claude-plugin/` (marketplace.json, plugin.json), `skills/` (6 skills plus `plugin.json`), `hooks/` (session and mode hooks in Node, plus the `band/` TSX mod), `commands/` (6 `.toml` command wrappers), `scripts/` (build, check and publish helpers), `tests/` (22 spec files), `benchmarks/` (agentic and arm results), `examples/`, `i18n/`, `assets/`, `docs/`, `pi-extension/`, `.opencode/`, `.openclaw/`, plus per-host adapter folders (`.cursor/`, `.windsurf/`, `.kiro/`, `.clinerules/`, `.qoder/`, `.github/`, and others). Root files include `AGENTS.md` (compact rules for any agent), `INSTALL.md`, `README.md`, `package.json` (npm `@dietrichgebert/ponytail`), `plugin.json` and `gemini-extension.json`.

## Counts

- 213 files in total.
- 1 marketplace (`ponytail`) and 1 plugin (`ponytail` 5.3.2, `source: ./`).
- 12 `SKILL.md` files, but only 6 unique skills: `skills/` holds 6, and `.openclaw/skills/` holds a second copy of each (different frontmatter, same names).
- 22 test files in `tests/`, plus `pi-extension/test/`.
- 0 bundled reference or template files inside any skill. Each skill folder contains only `SKILL.md`.
- About 50 files under `assets/` (images, banners, charts).

## Install / use

From the README:

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

Codex:

```bash
codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail
```

Then open `/hooks` in Codex, trust its two lifecycle hooks, and start a new thread.

Any other agent: copy `AGENTS.md` into the project, or install `skills/ponytail/SKILL.md` as a skill (see INSTALL.md for per-host steps).

Commands: `/ponytail [lite | full | ultra | off]`, `/ponytail band [on | off]`, `/ponytail band import`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help`.

## Skills

| Skill | One line | Bundled assets |
|---|---|---|
| `ponytail` | Always-on lazy-dev ruleset: smallest complete change, reply in one read. | None beyond SKILL.md. Loaded by `hooks/ponytail-activate.js`; compact copy in `AGENTS.md`. |
| `ponytail-review` | Reviews a change for bugs, security, load, untested risk, speed and bloat. | None. Reads connected code, not only the diff. |
| `ponytail-audit` | Same checks over the whole repo, ranked, read-only. | None. |
| `ponytail-debt` | Collects `shortcut:` comments into a ledger (writes `PONYTAIL-DEBT.md`). | None. |
| `ponytail-gain` | Prints the benchmark scoreboard (code, cost, time). | Cites `benchmarks/results/2026-10-07-agentic.md`. |
| `ponytail-help` | Quick reference for levels, skills and commands. | None. |

## Quality notes

- Scope is small and focused. Skills are prose instructions with consistent frontmatter (`name`, `description`, and in `.openclaw/` also `homepage`, `license`). The core prompt is about 50 lines.
- Benchmark claims (-53% code, -41% time, -45% tokens) come from the author's own runs (Opus 5.5, 39 tasks, 5 runs each). They are not independently verified here. The gain skill reports them as "measured".
- Duplicated skills: `.openclaw/skills/` mirrors `skills/` by build script (`scripts/build-openclaw-skills.js`). Expect drift unless the check script (`scripts/check-rule-copies.js`) runs.
- Hooks are real code, not just text. `hooks/ponytail-activate.js` uses `execFileSync` and writes a flag file under the Claude config dir. The band writes a CSV ledger to `~/.config/ponytail/band/` by default. It can POST to a webhook, but only if the user sets one (default empty).
- Supply-chain hygiene is stated in the README: install only from the GitHub repo or the npm package, and no `.exe` or `.dll` files are shipped.
- Tone is joke-heavy (README copy, "He won't say it"). Treat marketing numbers and FAQ text as the author's voice, not as specification.

## Relevance to adminhead

- The `band` is a working example of a Claude Code mod: `hooks/band/register.tsx` referenced from `hooks.json` `"modules"`, with `board.ts`, `metrics.ts` and a `types.d.ts`. Useful reference for `plugins/coremods/hooks/`, with the same single-`register.tsx` constraint.
- The ponytail prompt overlaps with adminhead's own style goals (minimal change, reuse before new code). It could be a reference for a skill, but it should not be installed alongside another "minimal" prompt without a conflict check.
- MIT permits vendoring with the license notice kept. Nothing in this repo is needed as a dependency; `ponytail-review` and `ponytail-audit` are the parts most worth comparing against `code-review` and `simplify` in this environment.
- Its `shortcut:` comment convention is a cheap way to track deliberate deferrals. The `ponytail-debt` skill can be copied as an idea without adopting the rest of the plugin.
