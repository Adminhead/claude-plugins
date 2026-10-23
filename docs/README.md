# docs

- `3rd-party/` — one folder per repo checked out under `3rd-party/` (gitignored): a hand-written overview and a generated catalog of every plugin, skill, agent, command and hooks file. Start at [3rd-party/README.md](3rd-party/README.md). Regenerate catalogs with `scripts/catalog-3rd-party.py`.
- `plans/` — current plans. [plans/plugin-adoption.md](plans/plugin-adoption.md) decides what comes into the restarted marketplace from the archive and third-party repos.
- `research/` — research notes and their detail files. `research/inventory-2026-10-17/` holds the per-scope inventories behind the adoption plan.
- `research/tools-to-research.md` — the inbox of tool links to look at, plus its sources. vet judges an entry and records the verdict in the ledger below.

Older plans, plugin pages and research from before the marketplace restart live under `archive/docs/`.

## Research ledger

One line per researched repo, verdict first, written by vet (format in `plugins/vet/skills/vet/SKILL.md`, step 6). Sorted Adopted, Watching, Stole the idea, Rejected, Not evaluated; oldest first within a verdict.

**Start here:** nothing waits on you. Watching triggers: a diagram need → archify, diagram-design; codebase-memory-mcp falls short → graphify.

- **Adopted** · [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) · 2026-10-21 · first seen 2026-10-17; single-binary code-graph MCP server, configured in `~/.claude.json` and used by plugin skills, so it is the code-intel default. → [detail](research/tools-2026-10-17.md#deusdatacodebase-memory-mcp)
- **Adopted** · [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) · 2026-10-21 · first seen 2026-10-17; official marketplace, listed in `allowCrossMarketplaceDependenciesOn` and depended on by dotnet-meta, java-meta and programming-core. → [detail](research/tools-2026-10-17.md#anthropicsclaude-plugins-official)
- **Watching** (recommendation) · [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) · 2026-10-21 · first seen 2026-10-17; Python AST code graph that overlaps codebase-memory-mcp, with a heavy install and a noisy PreToolUse hook, and no plugin uses it. → [detail](research/tools-2026-10-17.md#graphify-labsgraphify)
- **Watching** (recommendation) · [tt-a1i/archify](https://github.com/tt-a1i/archify) · 2026-10-21 · first seen 2026-10-17; skill with a Node CLI that turns code into explorable HTML diagrams, and no plugin has a diagram need yet. → [detail](research/tools-2026-10-17.md#tt-a1iarchify)
- **Watching** (recommendation) · [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) · 2026-10-21 · first seen 2026-10-17; editorial diagram plugin with 45 types, already installable, and no plugin has a diagram need yet. → [detail](research/tools-2026-10-17.md#cathrynlaverydiagram-design)
- **Stole the idea** (recommendation) · [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) · 2026-10-17 · MIT UI/UX rule data and offline search, to be ported as the planned uiux-lookup, keeping its rules, stack guidelines and font index, and dropping its generic palettes and styles. → [detail](research/uiux-design.md#1-source-comparison)
- **Stole the idea** (recommendation) · [anthropics/skills](https://github.com/anthropics/skills) · 2026-10-17 · Apache-2.0 `frontend-design` skill, planned as the spine of the ui-direction skill. → [detail](research/uiux-design.md#1-source-comparison)
- **Stole the idea** (recommendation) · [google/fonts](https://github.com/google/fonts) · 2026-10-17 · font metadata and licences, planned as the data behind uiux-lookup's font index, with provenance kept in its JSON. → [detail](research/uiux-design.md#1-source-comparison)
- **Stole the idea** · [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud) · 2026-10-21 · first seen 2026-10-17; statusline reference for the usage-band fields and pace logic, credited in `plugins/usage-band/README.md`, with no code copied. → [detail](research/claude-hud.md#0-which-repo-and-the-facts)
- **Stole the idea** · [jame581/GodotPrompter](https://github.com/jame581/GodotPrompter) · 2026-10-21 · first seen 2026-10-17; 56 Godot skills not installed, and parts adapted into the godot-* plugins, credited in their NOTICE files. → [detail](research/godot-prompter-review.md#verdict-in-brief)
- **Stole the idea** · [dtiger1889-ops/claude-harness-toolbox](https://github.com/dtiger1889-ops/claude-harness-toolbox) · 2026-10-21 · user chose to port guard rules, prove, necromancy and vet from it, with MIT credit in each plugin's NOTICE. → [detail](research/harness-toolbox-review.md#what-to-port)
- **Stole the idea** · [LilMGenius/paperthin](https://github.com/LilMGenius/paperthin) · 2026-10-23 · 28 plain-Markdown hygiene skills; 10 ported as plugins and 5 folded (one into catchup, four into prove, the-fool and session-retro), the other 13 repo-bound, covered or rejected. → [detail](plans/paperthin-ports.md#triage-all-28)
- **Rejected** (recommendation) · [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) · 2026-10-21 · first seen 2026-10-17; single-tool code graph replaced by codebase-memory-mcp at the restart, and absent from `~/.claude.json` and every plugin. → [detail](research/tools-2026-10-17.md#colbymchenrycodegraph)
- **Not evaluated** · [ryanthedev/herderp](https://github.com/ryanthedev/herderp) · 2026-10-21 · no license (GitHub reports none), so nothing is taken from it directly. Its digest idea reached necromancy through the toolbox, as necromancy's NOTICE says.

## Other research

Research files with no verdict, one bullet each.

- [design-dotnet.md](research/design-dotnet.md) — C#/.NET plugins and `dotnet-meta`: design.
- [design-godot.md](research/design-godot.md) — Godot and game-dev plugins: design.
- [uiux-design.md](research/uiux-design.md) — UI/UX design collection: sources, plugin design and port notes.
- [feature-flag-platforms.md](research/feature-flag-platforms.md) — feature flag platforms and practice.
- [git-branching-models.md](research/git-branching-models.md) — git-flow, HubFlow and trunk-based development.
- [evals-2026-10-17.md](research/evals-2026-10-17.md) — eval run, 2026-10-17.
- [evals-2026-10-20.md](research/evals-2026-10-20.md) — eval run, 2026-10-20 (JVM plugin set).
- [consult-lock-probes-2026-10-23.md](research/consult-lock-probes-2026-10-23.md) — codex app server lock probes for the consult per-thread lock checks (codex-cli 0.163.0).
- [evals-2026-10-23.md](research/evals-2026-10-23.md) — eval run, 2026-10-23 (paperthin ports, five trigger suites).
- [evals-2026-10-21.md](research/evals-2026-10-21.md) — eval run, 2026-10-21 (vet triggers; dependency breaks the eval sandbox).
- [inventory-2026-10-17/](research/inventory-2026-10-17/) — per-scope inventories behind the adoption plan.
- [implementation-2026-10-17/](research/implementation-2026-10-17/) — implementation briefs and round notes for the 2026-10-17 batch.
