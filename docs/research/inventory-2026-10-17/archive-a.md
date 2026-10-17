# Archive inventory A: coding, testing, review, git, GitHub, search, authoring and singles

Scope: 20 archived plugins under `archive/plugins/` (coding-core, coding-go, coding-python, coding-js, coding-rust, coding-shell, coding-esp, testing, review, git, github, github-admin, code-search, authoring, setup, research, prototype, experiment-loop, modernize, tooling). 75 rows: 66 skills, 1 agent, 3 hooks files (2 `hooks.json` plus the classic `codegraph-autoinit.json`), and 5 MCP servers from 3 `.mcp.json` files, one row per server.

## Summary

- **Verdicts:** port 56, merge 3, cross-dep 1, skip 15.
- These are our own skills and the quality is high throughout: concrete workflows, the right length (most are 40 to 110 lines with progressive-disclosure references), and good descriptions. So most rows are port. The real choices are which meta each one goes in and what to trim.
- **Edits every port needs:** rename cross-references from `plugin:skill` to the new one-skill plugin names. Replace `codegraph_explore` / `.codegraph/` hints with codebase-memory (`search_graph`, `trace_path`, `get_code_snippet`). This affects golang, python, rust, javascript, typescript, anti-slop, map-codebase, harness, planning/multi-agent-plans, research, release and triage. Drop the `claude-mem` lines (implement-plan, and planning/references). Drop `dynamic-workflows` (agent-teams). Drop "prefer the `github` MCP server" (5 github skills).
- **Headline picks:** a small baseline of `coding`, `problem-solving`, `planning`, `unit-testing` and `git-commit`, plus `recommend-plugins`, which is manual and adds nothing to the skill listing. The language skills go one per stack meta. A proposed `new:github-meta` holds pr, ship (+ shipper agent), pr-comments and issues. A proposed `new:web-frontend-meta` holds react, vite and e2e. second-opinion becomes two plugins: the `consult` mod and the skill that depends on it.
- **Skips:** the whole CodeGraph stack (skill, MCP, prompt mod, autoinit hook), because codebase-memory replaces it. Also the context7, grep-app and ripgrep skills, the GitHub and Exa MCP entries (gh CLI and the claude.ai connectors already cover them), create-skill (repo-local skill-authoring and Anthropic skill-creator cover it), map-codebase (codebase-memory `get_architecture` plus `/init`), agent-teams, worktree, editorconfig and the testing harness.
- **Third-party check:** nothing in mattpocock, agent-skills, superpowers, ECC or wshobson beats ours on the same job. Several of ours are already adapted from mattpocock and improved (domain-modeling, prototype, pr, triage, the TDD reference). Those collections are mega-plugins anyway, so they are wrong as cross-deps. The useful outside alternatives are named in the table: humanizer for prose de-slop, and from claude-plugins-official `code-modernization`, `claude-md-management`, `claude-code-setup`, `context7` and the LSP plugins.

## Table

Size is the SKILL.md line count plus the number of supporting files.

| Item | Source path | Verdict | Proposed plugin name | Meta(s) | Notes (overlap, license, edits needed, size) |
|---|---|---|---|---|---|
| coding | coding-core/skills/coding | port | coding | baseline | 42 lines + 1 ref. Smallest-correct-change discipline, reuse-first, verify the real contract. Fix cross-refs (`testing:unit`, `research:research`, `api:idempotency-retry`, `experiment-loop`). Some overlap with built-in `/simplify` at review time only. |
| implement-plan | coding-core/skills/implement-plan | port | implement-plan | none | 36 lines. Executes an approved multi-slice plan with worktree subagents and a Status block. Remove the `claude-mem:do` line. Could use the Workflow tool for parallel slices. superpowers' subagent-driven-development is the outside alternative, but it is a mega-plugin; ours is leaner. |
| planning | coding-core/skills/planning | port | planning | baseline | 83 lines + 5 refs (stress-test covers mattpocock's grill-me). Fix the codegraph/claude-mem mentions in `references/multi-agent-plans.md`. Plan mode is built in, but this adds the proportionate-verification rules. |
| problem-solving | coding-core/skills/problem-solving | port | problem-solving | baseline | 60 lines + 4 refs. Hypothesis-table debugging plus algorithm choice. Better structured than mattpocock `diagnosing-bugs` and agent-skills `debugging-and-error-recovery`. Fix refs to `review:poka-yoke`, `testing:unit`. |
| golang | coding-go/skills/golang | port | golang | golang-meta | 139 lines + 9 refs. Largest language skill; consider trimming the body by moving sections to refs. Replace `codegraph_explore` with codebase-memory. Adapted in part from samber/cc-skills-golang (MIT; keep attribution). |
| golang-cli | coding-go/skills/golang-cli | port | golang-cli | none | 88 lines + 2 refs, cobra 1.10 / viper 1.21. Install per project; leave it out of golang-meta to keep the meta lean. |
| golang-performance | coding-go/skills/golang-performance | port | golang-performance | none | 41 lines + 6 refs. Measurement-first: benchstat, pprof. Install directly when needed. |
| python | coding-python/skills/python | port | python | python-meta | 84 lines + 4 refs. Replace the codegraph line. |
| python-packaging | coding-python/skills/python-packaging | port | python-packaging | python-meta | 72 lines + 2 refs (uv, PyPI trusted publishing). Nearly every Python repo touches pyproject/uv, so it belongs in the meta. |
| fastapi | coding-python/skills/fastapi | port | fastapi | none | 82 lines. Fix refs to `auth:auth`, `web:web-development`, `db:*` (only some of these plugins may come back). |
| javascript | coding-js/skills/javascript | port | javascript | node-typescript-meta | 81 lines + 1 ref. Replace the codegraph line. |
| typescript | coding-js/skills/typescript | port | typescript | node-typescript-meta | 98 lines + 3 refs. Replace the codegraph line. |
| react | coding-js/skills/react | port | react | new:web-frontend-meta | 99 lines + 7 refs. Fix the `web:web-design` ref. |
| vite | coding-js/skills/vite | port | vite | new:web-frontend-meta | 83 lines + 1 ref, Vite 7/8 (Rolldown). Version facts will age; recheck at port time. |
| vue | coding-js/skills/vue | port | vue | none | 78 lines + 2 refs. A Vue project rarely also needs React, so install directly. |
| tanstack | coding-js/skills/tanstack | port | tanstack | none | 84 lines + 1 ref. Install directly. |
| click-path-audit | coding-js/skills/click-path-audit | port | click-path-audit | none | 59 lines + 1 ref. Niche but distinctive (UI handler side-effect map). Adapted from ECC (MIT). |
| rust | coding-rust/skills/rust | port | rust | rust-meta | 90 lines + 2 refs. Replace the codegraph line. |
| bash | coding-shell/skills/bash | port | bash | iac-meta; none | 55 lines + 4 refs (ShellCheck, Bats, POSIX). Also worth installing directly at user scope for anyone who writes hook scripts. |
| firmware-engineer | coding-esp/skills/firmware-engineer | port | esp-idf | none | 98 lines + 24 files (11 refs, templates). Too niche for a meta. Safety gates around eFuse/flash are valuable. Check the "v6.1 latest" date note at port time. |
| unit | testing/skills/unit | port | unit-testing | baseline | 51 lines + 3 refs including `tdd.md`. Matches or beats mattpocock `tdd` and agent-skills `test-driven-development`. |
| e2e | testing/skills/e2e | port | e2e-testing | new:web-frontend-meta | 77 lines + 1 ref. Fix the `playwright-cli:` and `web:` refs. |
| gap-audit | testing/skills/gap-audit | port | test-gap-audit | none | 79 lines + bundled `coverage_map.py` with tests. Read-only. |
| run | testing/skills/run | port | test-run | none (cheap enough for baseline) | 64 lines + 17 files (runner detection/parse scripts, fixtures, tests). `disable-model-invocation`, so it costs nothing in the listing. Strong token saver (compact failures). |
| harness | testing/skills/harness | skip | - | - | Forked test generator. It reaches into `run`'s script via `${CLAUDE_PLUGIN_ROOT}/skills/run/...`, which breaks under one-skill plugins, and it is built around codegraph. `unit-testing` plus `test-run` cover it. |
| anti-slop | review/skills/anti-slop | port | anti-slop | none | 46 lines + 2 refs. The code part overlaps built-in `/simplify`, so trim it to the prose and UI angle and the "remove first" rule. For sentence-level prose, humanizer (MIT, one skill, clean plugin) does that job better; it would be a cross-dep if its marketplace were allowed. |
| poka-yoke | review/skills/poka-yoke | port | poka-yoke | none | 88 lines + 1 ref. Unique; nothing comparable in third-party. |
| review-loop | review/skills/review-loop | port | review-loop | none | 38 lines. Built-in `/code-review --fix` applies findings once; this adds the findings file plus a fresh re-reviewer for up to 3 rounds. Edit it to use `/code-review` as the reviewer. |
| second-opinion | review/skills/second-opinion | port | second-opinion | none | 108 lines + 4 files (refs, `agy-gate.sh`, test). Depends on the `consult` plugin, which provides `mcp__review__consult`. Model names (gpt-6-*, gemini-3.x) need a refresh. The agy gate script lives in this skill but is called from the mod via `$.plugin.root/skills/second-opinion/scripts/`; move it into the consult plugin. |
| review hooks.json (consult mod) | review/hooks/hooks.json, register.tsx, consult/consult.ts | port | consult | none | A mod that registers the `consult` tool (codex/agy runner) plus session.start. One component. The tool name changes with the plugin name (`mcp__review__consult` becomes `mcp__consult__consult`); update the skill and docs to match. |
| branch | git/skills/branch | merge | into git-commit | - | 78 lines. Keep only the naming-convention detection, as a short section in git-commit. GitFlow/trunk explainers aren't worth a listing slot. The shipper agent preloads it today. |
| commit | git/skills/commit | port | git-commit | baseline | 104 lines, no refs (could move the release-please/commitlint detail into a ref). Better than official `commit-commands` (thin commands). |
| history | git/skills/history | port | git-history | none | 72 lines + 1 ref. Editor-free rebase/fixup/bisect/reflog with a backup ref. |
| worktree | git/skills/worktree | skip | - | - | Built-in EnterWorktree/ExitWorktree and Agent `isolation: "worktree"` cover the common case, and raw `git worktree` is well known. Put the useful tip (`worktree.baseRef: "head"`) in docs or settings instead. |
| issue-breakdown | github/skills/issue-breakdown | port | issue-breakdown | none | 56 lines + 1 ref. Same job as mattpocock `to-tickets`, adapted and gated on approval. Drop the github-MCP preference line. |
| issues | github/skills/issues | port | gh-issues | new:github-meta | 79 lines + 6 refs (gh ≥2.94 sub-issues/blocked-by). Drop the MCP preference line. |
| pr-comments | github/skills/pr-comments | port | pr-comments | new:github-meta | 59 lines + 12 files (`fetch.sh`, GraphQL, jq, fixtures). Manual, so it costs nothing in the listing. Drop the MCP line. |
| pr | github/skills/pr | port | gh-pr | new:github-meta | 79 lines + 2 refs. Credits Matt Pocock / Dex Horthy (MIT). Fix refs to `git:commit`. |
| release | github/skills/release | port | gh-release | none | 105 lines + 2 refs. Defers to release-please and others. Replace the codegraph mention. |
| ship | github/skills/ship | port | ship | new:github-meta | 48 lines, `context: fork`, `agent: github:shipper`. Must depend on the `shipper` plugin, and the agent ref must be renamed (`shipper:shipper`). |
| triage | github/skills/triage | port | gh-triage | none | 112 lines + 3 refs. Adapted from mattpocock `triage`, with stronger injection rules. Replace the codegraph mention. |
| shipper (agent) | github/agents/shipper.md | port | shipper | new:github-meta | 21 lines, haiku. Preloads `git:commit` and `git:branch`; change that to `git-commit:git-commit` and declare a dependency on git-commit. |
| github MCP server | github/.mcp.json (+ scripts/mcp-headers.sh) | skip | - | - | The skills use it only for reads that `gh` already does. The remote server's large tool menu costs context. If wanted, official `github@claude-plugins-official` exists. |
| actions | github-admin/skills/actions | port | gh-actions | none | 99 lines + 8 refs (security, CodeQL, efficiency, Go). One of the strongest; candidate for github-meta if CI edits are frequent. |
| code-security | github-admin/skills/code-security | port | gh-code-security | none | 128 lines, no refs; move the alert-triage tables into a ref. |
| dependabot | github-admin/skills/dependabot | port | dependabot | none | 61 lines + 2 refs. Absorbs dependabot-prs as a "sweep open PRs" section. |
| dependabot-prs | github-admin/skills/dependabot-prs | merge | into dependabot | - | 38 lines. Same domain; one listing slot is enough. |
| repo-setup | github-admin/skills/repo-setup | port | gh-repo-setup | none | 53 lines + 3 refs. Idempotent and dry-run first. |
| codegraph (skill) | code-search/skills/codegraph | skip | - | - | Superseded by codebase-memory-mcp and its `codebase-memory` skill. |
| context7 (skill) | code-search/skills/context7 | skip | - | - | The Context7 server's own instructions already say when and how to use it (seen in this session via the claude.ai connector). |
| grep-app (skill) | code-search/skills/grep-app | skip | - | - | 70 lines of query tips. A one-component plugin can't hold both the skill and the server; the tool's own description is enough. Revive it as its own plugin only if evals show the tool is underused. |
| ripgrep | code-search/skills/ripgrep | skip | - | - | 113 lines. The built-in Grep tool plus codebase-memory `search_code` cover it, and rg flags are well known. |
| code-search hooks.json (prompt.context mod) | code-search/hooks/hooks.json, register.ts | skip | - | - | Injects "use codegraph before Grep" guidelines. codebase-memory ships its own hooks. |
| codegraph-autoinit.json | code-search/hooks/codegraph-autoinit.json | skip | - | - | Classic SessionStart hook that runs `codegraph init`. Obsolete. |
| context7 MCP server | code-search/.mcp.json `context7` | cross-dep | context7@claude-plugins-official | none | Official plugin is MCP-only (focused, maintained). Needs `claude-plugins-official` added to `allowCrossMarketplaceDependenciesOn`. The claude.ai Context7 connector may make it redundant; see open questions. |
| codegraph MCP server | code-search/.mcp.json `codegraph` | skip | - | - | Superseded by codebase-memory-mcp. |
| grep-app MCP server | code-search/.mcp.json `grep-app` | port | grep-app | none | Five-line remote HTTP MCP plugin, no key. Nothing else covers public-GitHub code search; codebase-memory is local only. |
| adr-writing | authoring/skills/adr-writing | port | adr-writing | none | 52 lines + `new_adr.py` with tests, Nygard/MADR refs. codebase-memory has a `manage_adr` tool (graph-side ADR store); check how it relates so there aren't two ADR homes. |
| agent-config-audit | authoring/skills/agent-config-audit | port | agent-config-audit | none | 93 lines. Security review of `.claude/`, `.mcp.json`, hooks. Built-in `/security-review` reviews code changes, not config. |
| agent-teams | authoring/skills/agent-teams | skip | - | - | Agent teams are a built-in feature, and the built-in `workflow-authoring` covers scripted fan-out. It references the removed `dynamic-workflows`. Rarely used; revive only if team use becomes routine. |
| config-audit | authoring/skills/config-audit | port | config-audit | none | 42 lines + 1 ref. Context-cost and bloat audit; fits the "token efficient" goal. Overlaps `/fewer-permission-prompts` only on permissions. |
| create-skill | authoring/skills/create-skill | skip | - | - | Repo-local `.claude/skills/skill-authoring` plus Anthropic `skill-creator` cover it. Before deleting, fold any missing parts of `references/porting.md` and `writing-for-agents.md` into skill-authoring. |
| docs-audit | authoring/skills/docs-audit | port | docs-audit | none | 69 lines + `docs_drift.py` with tests and 2 refs. |
| domain-modeling | authoring/skills/domain-modeling | port | domain-modeling | none | 34 lines + 1 ref. Adapted from mattpocock `domain-modeling` (MIT); ours splits ADRs out. Fix the ref to `authoring:adr-writing`. |
| manage-agent-instructions | authoring/skills/manage-agent-instructions | port | agent-instructions | none | 49 lines + 4 refs (loading rules, `.claude/rules` paths, AGENTS.md coexistence). Deeper than official `claude-md-management` and `/init`. |
| map-codebase | authoring/skills/map-codebase | skip | - | - | codebase-memory `get_architecture`, the Explore agent and `/init` cover it. Its "every claim cites a file" rule could become a line in agent-instructions. |
| recommend-plugins | setup/skills/recommend-plugins | port | recommend-plugins | baseline | 77 lines, manual (zero listing cost). Must be rewritten for the meta/focused layout and cross-deps. Complements official `claude-code-setup` (generic automation recommender). |
| research | research/skills/research | port | research | none | 57 lines + 4 refs. Quick/deep bounded research with citations. Overlaps Anthropic `deep-research`, which is for long narrative reports; keep ours for quick and technical comparisons. Point it at whatever Exa/WebSearch is connected. Replace the codegraph mention. |
| exa MCP server | research/.mcp.json `exa` | skip | - | - | The claude.ai Exa connector is already present. Official `exa@claude-plugins-official` bundles skills, so it is not a focused cross-dep. If wanted, port a five-line MCP-only plugin. |
| prototype | prototype/skills/prototype | port | prototype | none | 28 lines + 2 refs. Adapted from mattpocock `prototype`. |
| experiment-loop | experiment-loop/skills/experiment-loop | port | experiment-loop | none | 79 lines + 1 ref. Metric-driven keep/revert loop. Distinct from official `ralph-loop` and built-in `/loop`. |
| modernize | modernize/skills/modernize | port | modernize | none | 49 lines + 3 refs. A lean planning skill. Official `code-modernization@claude-plugins-official` (8 agents and commands) is the heavyweight alternative; offer it as a direct install, not a dep. Fix the ref to `authoring:map-codebase` (now skipped). |
| editorconfig | tooling/skills/editorconfig | skip | - | - | 90 lines for a one-off file Claude writes fine from formatter config. Too niche to earn a slot. |
| hook-repair | tooling/skills/hook-repair | merge | into pre-commit | - | 54 lines. Same tool and audience; add it as a "repair a failing hook" section. |
| pre-commit | tooling/skills/pre-commit | port | pre-commit | none | 119 lines + 1 ref (Husky). Absorbs hook-repair, so move the setup detail into refs to keep the body under ~100 lines. Covers mattpocock `setup-pre-commit`. |

## Skipped bulk categories

- **CodeGraph stack (5 items):** the skill, MCP server, prompt.context mod and autoinit hook, plus the harness skill that is built around codegraph. codebase-memory-mcp replaces all of them.
- **Built-in or connector duplicates (5):** context7 skill, ripgrep, worktree, agent-teams, create-skill.
- **MCP servers already reachable (2):** github (gh CLI), exa (claude.ai connector).
- **Low value per listing slot (3):** grep-app skill, map-codebase, editorconfig.

## Open questions

1. **Baseline size.** Proposed: coding, problem-solving, planning, unit-testing, git-commit, plus manual recommend-plugins and optionally test-run, both of which cost nothing in the listing. That is five model-invoked descriptions. Is that small enough, or should planning and unit-testing move to the stack metas?
2. **New metas.** OK to add `github-meta` (gh-pr, ship, shipper, pr-comments, gh-issues; gh-actions optional) and `web-frontend-meta` (react, vite, e2e-testing)?
3. **claude-plugins-official as a cross-dep marketplace.** Add it to `allowCrossMarketplaceDependenciesOn`? That enables context7 here and the LSP plugins (gopls, pyright, typescript, rust-analyzer) for the stack metas. Or rely on the claude.ai Context7 connector and skip the context7 plugin entirely?
4. **Paired plugins.** second-opinion needs consult (mod), and ship needs shipper (agent), which needs git-commit. Is a dependency chain between one-component plugins acceptable? The alternative for ship is to drop the skill and make the shipper agent the entry point.
5. **Naming.** Should GitHub skills keep a `gh-` prefix (gh-pr, gh-issues) to avoid collisions with generic names in other marketplaces, or use bare names?
