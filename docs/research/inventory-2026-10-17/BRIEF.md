# Inventory review brief (shared by every reviewer)

Repo: /home/buck/Projects/adminhead/claude-plugins, the `adminhead` Claude Code plugin marketplace, restarted from scratch. Read-only task: do not edit anything in the repo.

## New marketplace structure
- `baseline` meta plugin (user scope): only plugins useful in EVERY session. A user cannot disable one dependency while baseline is enabled, so baseline must stay small.
- Project-scope stack metas: `python-meta`, `golang-meta`, `rust-meta`, `node-typescript-meta`, `iac-meta`. New metas may be proposed if a cluster clearly warrants one.
- Focused plugins: each ships EXACTLY ONE component (one skill, one agent, one hooks.json, or one MCP server). Supporting files (references/, scripts/) are fine.
- Goal: easy to use, powerful, token/context efficient. Each installed skill costs its description in every turn's skill listing, and its body when loaded.

## Givens
- codebase-memory-mcp is assumed installed (its own MCP server, hooks, and `codebase-memory` skill). It is the default code intelligence. So CodeGraph / code-search style skills, hooks and MCP servers are obsolete unless they add something it lacks.
- Claude Code built-ins already cover: /code-review (bug review, levels low..ultra), /simplify, /init, /security-review, /loop, /schedule, /run, /fewer-permission-prompts, claude-api skill, Workflow tool (multi-agent orchestration), agent teams, auto memory, Explore/Plan/general-purpose agents, Context7 can be added as a standalone MCP. Anthropic skills (skill-creator, docx/pdf/pptx/xlsx, deep-research) also exist.
- The repo has repo-local (not shipped) authoring skills in `.claude/skills/`: agent-authoring, hook-authoring, mod-authoring, skill-authoring, skill-evals, ship-plugin.
- Cross-marketplace deps: a meta or plugin may depend on `name@other-marketplace` if that marketplace is in `allowCrossMarketplaceDependenciesOn` (today only `claude-code-lsps`). A cross-dep installs the WHOLE upstream plugin, so it suits small, focused, maintained upstream plugins only. A mega-plugin (dozens of skills in one plugin) as a dep defeats context efficiency.
- Prior research to read and reuse (don't redo what it settled, but re-judge against the new structure): `archive/docs/research/third-party-skills-review.md` (large; grep it), `docs/research/tools-to-research.md`, `docs/3rd-party/<repo>/README.md` overviews, `docs/3rd-party/<repo>/catalog.md` generated catalogs. Third-party sources are checked out under `3rd-party/<repo>/`. Archived plugins are under `archive/plugins/`, their old docs under `archive/docs/plugins/`.

## Verdicts
- **port**: copy into this repo as a focused plugin and own it (rewrite/trim as needed). Needs a permissive license (MIT/Apache; note attribution). Prefer when we want to edit it, cut tokens, or the upstream packaging is a mega-plugin.
- **merge**: fold into another item you name (duplicates or overlaps); say which wins.
- **cross-dep**: install from the upstream marketplace unchanged, as a dependency of a meta or directly. Only for focused upstream plugins that are maintained.
- **skip**: obsolete, covered by built-ins/codebase-memory, low quality, too niche, unsafe, or unclear license. One-line reason.

Judge quality by actually opening the SKILL.md/agent file for every candidate you rate port or cross-dep (check: concrete and correct guidance, sane length, a description that would trigger well, no stale tool names). For big repos, don't open everything: triage by catalog descriptions, open the promising ones, and summarize skipped categories with counts.

## Output
Write your results to the file path given in your task, as Markdown:
1. A short summary (5-10 lines): counts per verdict and the headline picks.
2. A table: `| Item | Source path | Verdict | Proposed plugin name | Meta(s) | Notes (overlap, license, edits needed, size) |`. Proposed names are lowercase kebab-case, one component each; a multi-skill source becomes several plugins or gets split/merged. Meta column: baseline / python-meta / golang-meta / rust-meta / node-typescript-meta / iac-meta / new:<name> / none (install directly).
3. For skipped bulk categories, a short list with counts and reasons instead of rows.
4. Open questions for the user, if any.

Then reply with only: the file path, the verdict counts, and up to 8 headline recommendations. Keep the reply under 250 words.
