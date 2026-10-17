# agent-skills

Source: https://github.com/addyosmani/agent-skills · License: MIT · Last commit: 2026-10-13 (`chore(release): bump plugin manifests to 0.6.13`) · Catalog: [catalog.md](catalog.md)

## Purpose

A set of 25 production-oriented engineering skills (`SKILL.md` files) plus 4 reviewer personas and 9 lifecycle slash commands (`/spec`, `/plan`, `/build`, `/test`, `/review`, `/ship`, and others) for AI coding agents. The skills cover the whole development loop: define, plan, build, verify, review, ship. The repo is maintained by Addy Osmani (github.com/addyosmani) and ships as version 0.6.13 of a single Claude Code plugin, `agent-skills`, inside the `addy-agent-skills` marketplace. It also carries adapters for Codex, Gemini CLI, Antigravity, Copilot CLI, Cursor and OpenCode.

## Layout

- `skills/` - 25 skill directories, each with a `SKILL.md`; a few add a local `references/` folder.
- `agents/` - 4 persona prompts: `code-reviewer`, `security-auditor`, `test-engineer`, `web-performance-auditor`.
- `commands/` - 9 `.toml` command wrappers for the Antigravity CLI.
- `.claude/commands/` - 9 Markdown slash-command wrappers for Claude Code.
- `.claude-plugin/` - `marketplace.json` and `plugin.json` for Claude Code.
- `.codex-plugin/`, `.agents/plugins/` - Codex plugin metadata and marketplace registration.
- `.gemini/`, `.opencode/` - command and config adapters for those hosts.
- `hooks/` - 4 shell hooks (`session-start.sh`, `sdd-cache-pre/post.sh`, `simplify-ignore.sh`) with their tests. No `hooks.json`, so the plugin does not wire them.
- `references/` - 7 shared checklists (security, performance, accessibility, testing, observability, orchestration, definition of done).
- `evals/` - eval cases, fixtures and a plugin-level eval suite, plus a README on skill-trigger and behaviour testing.
- `scripts/` - Node validators (`validate-skills.js`, `validate-commands.js`, `validate-versions.js`, reference and artifact-path checks) and an eval runner, each with a `*-test.js`.
- `docs/` - per-host setup guides (Claude Code, Codex, Cursor, Gemini CLI, Antigravity, Copilot, OpenCode and others), plus `skill-anatomy.md` and `adoption-guide.md`.

## Counts

From [catalog.md](catalog.md):

| Kind | Count |
|---|---|
| Marketplaces | 1 |
| Plugins | 1 |
| Skills | 25 |
| Agents | 4 |
| Commands / prompts | 9 |
| hooks.json files | 0 |

## Install / use

Claude Code, marketplace (from the README):

```
/plugin marketplace add addyosmani/agent-skills
/plugin install agent-skills@addy-agent-skills
```

If SSH clones fail, use the HTTPS URL instead: `/plugin marketplace add https://github.com/addyosmani/agent-skills.git`.

Claude Code, local development:

```bash
git clone https://github.com/addyosmani/agent-skills.git
claude --plugin-dir /path/to/agent-skills
```

Any agent, via the open skills CLI (70+ hosts):

```bash
npx skills add addyosmani/agent-skills                                  # all 25 skills
npx skills add addyosmani/agent-skills --list                           # browse first
npx skills add addyosmani/agent-skills --skill code-review-and-quality  # one skill
```

Other hosts: Codex (`codex plugin marketplace add addyosmani/agent-skills` then `codex plugin add agent-skills@agent-skills`), Gemini CLI (`gemini skills install https://github.com/addyosmani/agent-skills.git --path skills`), Antigravity (`agy plugin install https://github.com/addyosmani/agent-skills.git`). Cursor has no plugin: copy `skills/` into `.cursor/skills/` by hand.

## Highlights

- `skills/constraint-driven-development/SKILL.md` - Writes the project's quality bar to `CONSTRAINTS.md` and flags agents that weaken it (new `@ts-ignore` or eslint-disable lines, deleted tests, lowered thresholds). Notable because it turns "don't lower the bar" into something checkable.
- `skills/doubt-driven-development/SKILL.md` - Spawns a fresh-context reviewer whose job is to disprove each non-trivial decision before it stands. Distinct from `/review`, which judges a finished artifact.
- `skills/code-review-and-quality/SKILL.md` - Multi-axis review (about 400 lines), the longest skill in the set, and the basis for the `code-reviewer` persona.
- `skills/test-driven-development/SKILL.md` - Red-green-refactor written as enforced steps, with a referenced testing checklist.
- `skills/incremental-implementation/SKILL.md` - Thin vertical slices, each verified before the next. Pairs with the `/build` command.
- `commands/build.toml` (and `.claude/commands/build.md`) - `/build auto` generates the plan and runs every task in one approved pass, committing each task and pausing on failures.
- `skills/using-agent-skills/SKILL.md` - Meta-skill that routes to the other 24 by phase. Useful as a model for a router skill.
- `skills/context-engineering/SKILL.md` - Context-hierarchy guidance for rules files and session setup; applies directly to CLAUDE.md design.
- `hooks/sdd-cache-pre.sh` - Caches WebFetch results keyed by URL and revalidates with ETag or Last-Modified (304 means cache hit). A real HTTP-level cache, not a prompt hack.
- `evals/README.md` - Measures whether skills trigger when they should, stay distinct from one another, and change agent behaviour. Few skill repos ship this.
- `references/` - Shared checklists (security, performance, accessibility) that skills point to instead of repeating them.

## Quality notes

- Frontmatter: all 25 `SKILL.md` files have exactly `name` and `description`, and nothing else. This is complete for Claude Code but gives no `allowed-tools` or model hints.
- Descriptions: 211 to 893 characters. Most follow the "what it does. Use when..." pattern, with trigger phrases, so routing should be reliable. Some are long and repetitive ("Use when... Use when...").
- Size: 192 to 398 lines per skill (about 7,300 lines total). Substantial, with worked checklists; no stubs found.
- Duplication: the same concept appears in several places, such as code review (skill, `code-reviewer` agent, `/review` command) and simplification (`code-simplification` skill, `/code-simplify` command). The skills and command wrappers are kept in sync by `scripts/validate-commands.js`.
- Hooks: `hooks/` is not wired by the plugin (no `hooks.json`); `session-start.sh` is documented as a helper for hosts without native routing. Nothing runs automatically on install.
- Risk: `hooks/sdd-cache-post.sh` runs `curl -sI -L` against any URL a WebFetch touches (5-second timeout), so it makes outbound requests. Hooks need `jq` and `curl` and degrade silently when either is missing. No API keys are required anywhere.
- Install gap: a per-skill `npx` install copies only `skills/<name>/`, so shared `references/` links break (upstream issue #361, acknowledged in the README).
- Maintenance: active (release commit 2026-10-13), with validators and tests under `scripts/`. Version is in `plugin.json`, `marketplace.json` and `.codex-plugin/plugin.json`, checked by `validate-versions.js`.

## Relevance to adminhead

- Borrow the `constraint-driven-development` and `doubt-driven-development` skills as standalone plugin skills in a `coremods`-style plugin, after checking their CONSTRAINTS.md conventions against this repo's own rules.
- The `sdd-cache-pre.sh` / `sdd-cache-post.sh` pair is a candidate for a mod in `plugins/coremods/hooks/` (a `tool.call` check on WebFetch), but its curl-based design would need a rewrite for the mods sandbox, which has no `fetch` and no `node:` modules.
- Cross-install: the `addy-agent-skills` marketplace can be added to this repo's `marketplace.json` as a third-party entry, or its skills copied into `.claude/skills` for personal use. Pin the version (0.6.13) and keep a note here when it changes.
- Use the `scripts/validate-skills.js` and `scripts/validate-versions.js` approach as a model for a `claude plugin validate` check on this repo's own plugins.
