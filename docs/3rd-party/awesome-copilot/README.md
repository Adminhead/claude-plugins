# awesome-copilot

Source: https://github.com/github/awesome-copilot · License: MIT (Copyright GitHub, Inc.) · Last commit: 2026-10-16 (merge of PR #4945) · Catalog: [catalog.md](catalog.md)

## Purpose

GitHub's official, community-contributed collection of customizations for GitHub Copilot: custom agents, path-scoped instructions, Agent Skills, hooks, workflows and plugin manifests. It targets Copilot CLI, VS Code and the Copilot coding agent, not Claude Code. The clone lives at `3rd-party/awesome-copilot/` (gitignored).

## Layout

Top-level directories (file counts from a local `find`):

- `agents/`: 222 files, mostly `*.agent.md` (224 across the repo)
- `instructions/`: 192 files, `*.instructions.md` (193 across the repo)
- `skills/`: 435 skill directories, each with `SKILL.md` plus optional `scripts/`, `references/`, `assets/` (453 `SKILL.md` in total, including nested and `.github/skills/`)
- `hooks/`: 8 hook folders (29 files), each with `hooks.json`, a script and a README
- `plugins/`: 105 folders, 104 with `plugin.json` (Copilot-specific manifests with `com.github.copilot` keys)
- `extensions/`: 34 folders, the code/assets that `plugin.json` points to
- `workflows/`: 8 markdown workflow definitions
- `cookbook/`: 92 files of recipes for Copilot APIs
- `docs/`: generated `README.*.md` indexes (agents, instructions, skills, hooks, plugins, workflows)
- `eng/`: 62 files of maintenance tooling (catalog, validation)
- `website/`: 790 files for the awesome-copilot.github.com site
- `.schemas/`: JSON schemas for collection, cookbook and tools manifests
- No `prompts/` directory and no `*.prompt.md` files; no `*.collection.yml` files

## Counts

From the catalog header (`catalog.md`), with my recount where it differs:

| Kind | Catalog | Recount |
|---|---|---|
| Marketplaces | 0 | n/a |
| Plugins | 0 | 104 `plugin.json` (catalog does not count `plugins/`) |
| Skills | 453 | 453 `SKILL.md` (matches) |
| Agents | 225 | 224 `*.agent.md` |
| Commands / prompts | 0 | 0 `*.prompt.md` |
| hooks.json files | 8 | 8 (matches) |
| Instructions | not listed | 193 `*.instructions.md` (185 with `applyTo`) |

## Format compatibility with Claude Code

- **Skills (`skills/*/SKILL.md`): usable as-is.** All 453 files have `name` and `description`, and the Agent Skills frontmatter parses. Claude Code ignores the extra keys (`license`, `compatibility`, `metadata`, `argument-hint`). Caveats: 15 nested `qdrant-*` skills have a `name` that differs from their directory (the parent prefix is included), and a few `allowed-tools` lists use Copilot tool names such as `Azure MCP/...`. Bundled `scripts/` run as-is if their dependencies exist. Copy a skill into `.claude/skills/` or a plugin's `skills/` directory.
- **Agents (`agents/*.agent.md`): needs conversion.** The Markdown body is reusable, but the frontmatter is Copilot's.
  - `tools` uses Copilot aliases (`search`, `edit/editFiles`, `codebase`, `web/fetch`, `githubRepo`, `runCommands`, `problems`). 160 of 224 files have it. Map them to Claude tools (`Grep`/`Glob`, `Edit`/`Write`, `Read`, `WebFetch`, `Bash`) or drop them.
  - `model` is a Copilot model (`GPT-5`, `GPT-4.1`, `Claude Sonnet 4.5`, `claude-3.5-sonnet`) in 84 files. Claude subagents take `sonnet`, `opus`, `haiku` or `inherit`, so map or omit.
  - `mode: subagent|primary` (15), `handoffs` (2) and `mcp-servers` (20) are Copilot-specific and need translation or removal.
  - Target: `.claude/agents/<name>.md` with `name`, `description`, `tools`, `model`.
- **Instructions (`instructions/*.instructions.md`): needs a small conversion.** The body is reusable. `applyTo` globs (185 files) map to Claude Code path-scoped rules, which use a `paths:` frontmatter list (confirm against current docs). `applyTo: '**'` becomes an unscoped rule, and files without `applyTo` become always-on guidance in `CLAUDE.md` or a rule file.
- **Prompts (`*.prompt.md`): not applicable here.** None exist in this checkout. If added, they would map to `.claude/commands/<name>.md` (`description`, `argument-hint`, `allowed-tools`, `model`). `mode` and `agent` have no direct equivalent.
- **Hooks (`hooks/*/hooks.json`): not directly usable.** Copilot's manifest (`"version": 1`, `hooks.sessionEnd[]` with `type`, `bash`, `cwd`, `env`, `timeoutSec`) differs from Claude's event/matcher/`command` format. The scripts read Copilot's stdin payload, so their input parsing must change. The detection logic (for example the secrets-scanner regex set) can be reused.
- **Collections (`*.collection.yml`): not applicable.** None exist. `.schemas/collection.schema.json` still defines them. Items are `path` (a skill or prompt/instruction/agent file) and `kind`, with optional `usage` and `display` settings.
- **Plugins (`plugins/*/plugin.json`): not directly usable.** These are Copilot manifests whose `extensions` point at `extensions/`. Claude Code expects `.claude-plugin/plugin.json`, so write a new manifest for any plugin built from this content.

## Install / use

- **Copilot CLI:** `copilot plugin marketplace add github/awesome-copilot`, then `copilot plugin install <plugin-name>@awesome-copilot`. The README notes that recent versions already register the marketplace.
- **Skills:** `gh skills install github/awesome-copilot <skill-name>` (shown in `docs/README.skills.md`).
- **VS Code and the coding agent:** copy `*.agent.md` into `.github/agents/`, `*.instructions.md` into `.github/instructions/`, and skills into `.github/skills/`.
- **Collections:** the schema defines `*.collection.yml` bundles that group items for browsing. None are checked in now. The plugin manifests under `plugins/` (see `docs/README.plugins.md`) appear to have taken over the bundling role. Commit `e986f496` ("Migrate extension metadata to plugin.json") is the likely point of that change; I did not confirm it.

## Highlights

- `skills/agent-governance/SKILL.md`: policy, trust and audit controls for agent tool use (general, framework-neutral)
- `skills/acquire-codebase-knowledge/SKILL.md`: maps a repo with `scripts/scan.py`; a clean example of the spec with `license` and `compatibility`
- `skills/agentic-eval/SKILL.md`: self-critique, evaluator-optimizer and rubric-based evaluation patterns
- `skills/agent-owasp-compliance/SKILL.md`: checks an agent codebase against the OWASP Agentic Security Top 10
- `skills/agent-supply-chain/SKILL.md`: SHA-256 integrity manifests and tamper checks for agent plugins
- `skills/agent-architecture/SKILL.md`: requirements discovery and audit of agent architectures
- `skills/ai-ready/SKILL.md`: generates AGENTS.md, instruction files and CI workflows for a repo
- `agents/accessibility-runtime-tester.agent.md`: runtime keyboard, focus and WCAG checks in a real browser
- `instructions/a11y.instructions.md`: WCAG 2.2 AA anti-patterns with fixes, `applyTo: '**'`
- `instructions/agent-skills.instructions.md`: guidance for writing Agent Skills, `applyTo: '**/skills/**/SKILL.md'`
- `hooks/secrets-scanner/`: sessionEnd scan of modified files for 20+ secret patterns
- `hooks/session-logger/`: logs prompt, session start and session end
- `plugins/accessibility-kanban/plugin.json`: example plugin manifest with an `extensions` pointer
- `.schemas/collection.schema.json`: the collection manifest schema

## Quality notes

- All 453 SKILL.md files have frontmatter with `name` and `description`. Skills are the most consistent kind.
- Agent frontmatter is uneven: stale or unusual model names, mixed `tools` syntax, and Copilot-only keys. Expect hand edits.
- The README says the contributions are third-party and should be inspected before installing. Hooks run shell scripts with access to the session, so read them before use.
- Many bodies mention Copilot specifically ("Copilot coding agent", VS Code settings, `.github/` paths). Generic skills are easier to reuse than agents.
- The catalog's counts differ from a fresh `find` (agents 225 vs 224; plugins 0 vs 104). Treat the catalog as approximate.
- The repo is an active, maintained project (last commit 2026-10-16, contributor gate per `CONTRIBUTING.md`), but the gate targets Copilot relevance, not Claude compatibility.

## Relevance to adminhead

- **Skills first.** The 453 SKILL.md files need the least work. Copy selected skills into a plugin's `skills/` directory and keep the MIT copyright notice with them.
- **Agents with a tool mapping.** Convert a few agents, such as `accessibility-runtime-tester`, into `.claude/agents/` format with `tools` and `model` rewritten.
- **Instructions as rules.** `instructions/a11y.instructions.md` and similar files could ship as path-scoped rules in a Claude Code plugin, with `applyTo` mapped to `paths:`.
- **Hook logic, not hook manifests.** The secrets-scanner patterns could back a Claude Code hook, rewritten to the Claude event format. `plugins/coremods` already mixes classic hooks and mods, so the scanner would fit there.
- **Not worth porting directly:** collections and plugin manifests, since they are Copilot-specific and the marketplace already has its own layout.
