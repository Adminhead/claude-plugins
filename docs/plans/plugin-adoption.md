# Plugin adoption plan

Status: draft, 2026-10-17. Revised the same day with the user's decisions on metas, orchestration, Sentry and naming. Remaining open questions are at the end.

This plan decides what comes into the restarted marketplace from the archived plugins (`archive/plugins/`) and the third-party repos (`3rd-party/`), and what stays a cross-marketplace install. It is built from seven inventories in [`docs/research/inventory-2026-10-17/`](../research/inventory-2026-10-17/) (one per scope, with a row per skill, agent, hook and MCP server). The shared criteria are in that folder's `BRIEF.md`.

## What was reviewed

| Source | Items | Port | Merge | Cross-dep | Skip |
| --- | --- | --- | --- | --- | --- |
| Archive A: coding, testing, review, git, GitHub, authoring | 75 | 56 | 3 | 1 | 15 |
| Archive B: domain, tools, crew, coremods | 78 | 54 | 6 | 0 | 18 |
| mattpocock, agent-skills, humanizer, anti-slop, ponytail, taste-skill, best-practice | ~121 | 17 | 16 | 1 | ~87 |
| wshobson-agents | 185 skills, 202 agents | 10 | 24 rows | 2 | rest |
| ECC | 311 skills, 71 agents | 3 | 33 rows | 0 | rest |
| awesome-copilot | 453 skills, 224 agents | 3 | 45 rows | 0 | rest |
| claude-skills, claude-seo, gamedev, cybersecurity | ~1,000 | 3 | 10 | 0 | rest |

The reviewers didn't know about each other's scopes, so this plan resolves their conflicts. The counts above are theirs; the decisions below are the merged result.

## Decisions

### 1. The archive wins wherever it already did the work

The 2026-10-02 review already condensed most useful ECC, wshobson and awesome-copilot content into the archived skills. Those are 35 to 140 lines against 400 to 750 upstream, and every reviewer who compared them picked the archive. So third-party sources only contribute named deltas (a reference file, a few rules) to archived skills. They aren't re-ported.

This overrides the wshobson reviewer's `port` rows for `terraform`, `helm`, `gitops`, `postgres`, `bash`, `git-history`, `uv`, `python-patterns` and `pytest-patterns`. Archived versions of all of these exist, and the wshobson content becomes merges into them.

### 2. Cross-marketplace dependencies stay minimal

- **Keep `claude-code-lsps` as the only allowlisted marketplace.** The stack metas depend on its LSP plugins, as the archived coding plugins did: `pyright`, `gopls`, `rust-analyzer`, `vtsls`, `bash-language-server`.
- **`avoid-ai-writing@conorbronsdon-skills` is a direct user-scope install**, not a dependency. It wins the writing-style comparison (single skill, MIT, maintained, deterministic detector). wshobson's marketplace only mirrors it. It is already in `examples/claude-settings/settings.global.json`.
- **Don't allowlist `claude-code-workflows` (wshobson).** Only 2 of its 92 plugins are single-component, and allowlisting exposes the other 90. Port `file-conversion` if wanted.
- **Don't allowlist `claude-plugins-official`.** Context7 gets added on its own when a project needs it. The official pr-review-toolkit and feature-dev agents can be direct installs.
- **Never depend on a mega-plugin:** ECC, mattpocock, agent-skills, taste-skill, claude-skills, claude-seo, ponytail. Port the pieces instead, or install upstream directly for SEO and game-dev work.

### 3. Meta layout

`programming-core` is a core bundle: a deps-only plugin that metas may list, holding the general programming plugins. The language and web metas list it. A test install of `python-meta` and `node-typescript-meta` into one project (2026-10-17, throwaway `CLAUDE_CONFIG_DIR`) confirmed there is no collision: `programming-core` gets one `enabledPlugins` entry, the second meta reuses it, and uninstalling one meta leaves it for the other.

All of these metas and the bundle exist now, with empty dependency lists.

| Meta | Scope | Installs |
| --- | --- | --- |
| `baseline` | user | Only zero- or low-context items: `git-commit`, `recommend-plugins` (manual), `handoff` (manual), `check-bypass-guard` (hook), `bash-danger-guard` (mod). `git-statusline`, `usage-band` and `mcp-health` (mods). |
| `programming-core` (bundle) | via metas | `coding`, `problem-solving`, `planning`, `unit-testing`, `test-run` (manual) |
| `python-meta` | project | `programming-core`, `python`, `python-packaging`, `dependency-vetting`, `pyright@claude-code-lsps` |
| `golang-meta` | project | `programming-core`, `golang`, `gopls@claude-code-lsps` |
| `rust-meta` | project | `programming-core`, `rust`, `rust-analyzer@claude-code-lsps` |
| `node-typescript-meta` | project | `programming-core`, `javascript`, `typescript`, `dependency-vetting`, `vtsls@claude-code-lsps` |
| `design-core` (bundle) | via metas | `ui-direction`, `ui-critic` (A), `web-design`, `screen-reader-testing`, `accessibility-review`, `ux-copy`. See decision 9. |
| `web-meta` | project | `programming-core`, `design-core`, `web-development`, `react`, `vite`, `e2e-testing`, `playwright-cli`, `browser-tester` (A), `web-perf-auditor` (A) |
| `design-meta` | project | `design-core`, `uiux-lookup`, `design-critique`, `design-system`, `design-handoff`. No `programming-core`. |
| `iac-meta` | project | `terraform`, `ansible`, `docker`, `bash`, `cloud-ops-guard` (H), `devops` (A), `bash-language-server@claude-code-lsps` |
| `kubernetes-meta` | project | `kubernetes`, `helm`, `gitops` |
| `github-meta` | project | `gh-issues`, `gh-pr`, `pr-comments` (manual), `ship`, `shipper` (A), `gh-actions`, `dependabot` |
| `orchestration-meta` | user or project | `orchestration` (A), `agent-router` (M), the general agents `coder`, `architect`, `reviewer`, `debugger`, `scribe`, and `readonly-agent-gate` (H). See decision 6. |

Reviewers also proposed `aws-meta`, `api-meta`, `observability-meta` and `database-meta`. Each is a 3- to 6-skill cluster that suits only some repos, and a meta's members can't be turned off one by one. They stay direct installs until a real project needs the whole set.

### 4. Overlaps resolved

| Overlap | Winner | What the others contribute |
| --- | --- | --- |
| Writing style: avoid-ai-writing, humanizer, anti-ai-slop-writing, archived anti-slop | avoid-ai-writing (upstream, direct install) | humanizer is the fallback. anti-ai-slop-writing skipped (no license). Archived anti-slop's "remove first" rule merges into `coding`; `/simplify` covers its code half. |
| Smallest-change discipline: archived coding, ponytail ruleset | `coding` | ponytail's ~40-line ruleset merges into `coding`. This drops the upstream ponytail plugin and avoids a per-session context injection. |
| Debugging: archived problem-solving, mattpocock diagnose, agent-skills debugging, crew debugger | `problem-solving` (skill) | mattpocock's feedback-loop and "red-capable command" gate merge in. `debugger` is a general agent in `orchestration-meta`. |
| TDD: archived unit, mattpocock tdd, agent-skills TDD, ECC tdd-workflow | `unit-testing` | mattpocock's seams and tautological-test rules merge into `references/tdd.md`. wshobson pytest and Jest/Vitest material goes into framework references. |
| Grilling: archived planning stress-test, mattpocock grill, agent-skills interview-me | `planning` | grill's frontier rounds and agent-skills' confidence stop condition merge into `references/stress-test.md`. |
| Idea critique: the-fool, doubt-review, second-opinion | all three, direct installs | Different jobs: critique an idea, review an in-flight decision with fresh context, get another model's opinion. |
| Tickets: archived issue-breakdown, mattpocock to-tickets and to-spec | `issue-breakdown` | to-tickets' blocking edges and to-spec's spec-first step merge in. |
| PR body: archived gh-pr, mattpocock pr | `gh-pr` | Already adapted from mattpocock; diff upstream for new fixes. |
| Git-skip guard: wshobson block-no-verify, ECC config-protection and block-no-verify | `check-bypass-guard` (one hooks.json) | Blocks `--no-verify`, `core.hooksPath=` and `SKIP=` on git, and asks before edits to existing lint configs (eslint, ruff, golangci, rustfmt, clippy, pre-commit). |
| Frontend design: archived web-design, taste-skill v2, Anthropic frontend-design | `web-design` for existing systems | New-UI work goes to `ui-direction` (decision 9). |
| ADRs: archived adr-writing, codebase-memory `manage_adr` | `adr-writing` | Check how `manage_adr` stores ADRs before porting, so there aren't two homes. |

### 5. Every archived plugin is split up

Each archived plugin becomes one focused plugin per skill, agent, hooks file, MCP server or mod. A group name such as `coding-js`, `github-admin` or `coremods` doesn't survive. Multi-mod modules split per mod (coremods becomes `git-statusline`, `usage-band`, `agent-status` and `bash-danger-guard`), and crew splits into its agents plus `readonly-agent-gate`. The adoption list below is already at that grain.

### 6. Orchestration and agents

**`orchestration-meta`** gives a main-thread orchestration agent and a collection of general, non-specialized agents:

- `orchestration` (A): the main-thread agent, rebuilt from crew's `orchestration.md` without the hard-coded crew roster. Launched as the session agent (the old `claude-tmux` / `claude-crew` flow).
- `agent-router` (M): builds the orchestrator's routing rules from the agents actually installed. It collects each agent type from the `agent.offer` event (name, `description`, `source`, `provider`) and writes a routing table into the system prompt through `prompt.section`, only when the main thread runs `orchestration`. So installing `web-meta` adds `browser-tester` to the routes without editing the orchestrator. To verify when building: that the agent listing is offered before the system prompt is assembled, and how a mod tells the main thread's agent type. The fallback is reading the installed plugins' `agents/` directories with `$.fs`.
- General agents: `coder` (one agent; the caller picks the model, replacing coder, coder-high and coder-max), `architect`, `reviewer` (absorbs quick-review; the caller picks the depth), `debugger` (absorbs debugger-critical), `scribe`.
- `readonly-agent-gate` (H): read-only Bash for `architect`, `reviewer` and `debugger`. Plugin agents can't carry frontmatter hooks, so this is its own plugin. Its agent list is configurable, so specialized read-only agents can join it.

**Specialized agents live with their skills.** They go in the same meta as the skills they serve, or install alongside them directly:

| Agent | Goes with |
| --- | --- |
| `browser-tester`, `web-perf-auditor` | `web-meta` |
| `devops` | `iac-meta` |
| `shipper` | `github-meta` |
| `dba` | the database skills (direct installs) |
| `security-auditor` | the security skills (direct installs) |
| `plugin-vetter` | `agent-config-audit` (direct installs) |

`dba`, `devops` and `security-auditor` were merged into skills in the first draft. They come back as agents, with their safety rules also kept in the matching skills.

### 7. Names

Prefix a name only when it is likely to collide with another marketplace's plugin. Plugin names clash when two installed plugins share one, even from different marketplaces.

- Prefix generic words that belong to a family: `gh-pr`, `gh-issues`, `gh-release`, `gh-triage`, `gh-actions`, `api-keys`, `api-webhooks`, `api-idempotency`, `aws-resource-query`, `aws-cloudwatch`.
- Keep tool and product names bare: `terraform`, `docker`, `postgres`, `helm`, `react`, `graphql`, `grpc`, `dependabot`, `playwright-cli`.
- The core skills and general agents (`coding`, `planning`, `problem-solving`, `coder`, `reviewer`, `debugger`, `scribe`) stay bare. Rename one only if a real clash shows up.

### 8. Mods, informed by claude-hud

[claude-hud](https://github.com/jarrodwatts/claude-hud) (MIT, v0.11.3) is a classic `statusLine` command that parses the transcript. Mods can't draw into the status line, so nothing is ported; its ideas are rebuilt on the mods API. Full comparison, with the `claude-code.d.ts` type behind each item: [`docs/research/claude-hud.md`](../research/claude-hud.md).

**`usage-band` enhancements** (the archived band already beats claude-hud on the per-category context bar, the auto-compact marker and free tokens):

1. Pace colouring: grade each window by `percentUsed` against the elapsed share of the window (`SessionRateLimit.resetsAt`, `$.clock.now()`), with a `▲` when it would run out before reset. Replaces the fixed 60/85% colours. Pure logic in a side file (`pace.ts`).
2. A toast the first time a window turns amber or red, and when it resets (de-duplicated per window). This was claude-hud's idea as a separate `limit-pace` mod; it lives in usage-band instead.
3. Show the weekly window in the collapsed row when it is high or pacing badly, and render the `spend_limit` window.
4. Reset as a clock time (`↻ 14:30`), or repaint on a slow `$.clock.every`, so an idle countdown doesn't go stale.
5. Session cost (`SessionUsage.cost.usd`), last-response cache hit rate (`SessionContextBreakdown.apiUsage`), compaction count (`session.compact`), and an effort badge (`turn.step` effort).
6. A hide-until-threshold option, so the limits rows appear only past N% or on a pace alert.

Not available to mods: the real prompt-cache expiry, per-model weekly windows, the session name and the account plan.

**Enhancements to the other archived mods:**

- `git-statusline`: worktree marker, colour for many unpushed commits, stash count.
- `agent-status`: per-agent model and time since spawn, cached from `agent.spawn` (`AgentInfo` has neither). Check the built-in teammate view first; keep only what it lacks.

**New helper mods** (one plugin each). `mcp-health` goes in `baseline`; the others are direct installs:

| Mod | Shows | Where |
| --- | --- | --- |
| `mcp-health` | `mcp: <server> ✗` when a server's latest call errored (`tool.call` result `isError`), hidden while all are fine | PromptHint segment |
| `cache-clock` | `cache warm → 14:32`, turning cold past a configured TTL. Approximate: last main-loop `turn.complete` plus the TTL | `$.ui.status` line |
| `turn-stats` | A toast after long turns: duration, output tokens, cache hit rate (`turn.complete`) | Toast |

**Skipped from claude-hud:** the status-line architecture and transcript parsing, auth and email display, `--extra-cmd` shell execution, the RAM line, external usage files, the cross-session cost ledger, config counts (`/context` shows them) and i18n. Nothing duplicates `/context`, `/usage`, `/cost`, the teammate view, the task list or the transcript's tool rows.

### 9. UI and UX collection

One collection combines Anthropic's frontend-design (Apache-2.0), taste-skill v2 (MIT) and ui-ux-pro-max (MIT), plus our archived web-design and screen-reader-testing and ports of Anthropic's design plugin skills (anthropics/knowledge-work-plugins, Apache-2.0). Full comparison and port notes: [`docs/research/uiux-design.md`](../research/uiux-design.md). Decisions confirmed by the user on 2026-10-17.

| Plugin | Type | Job | Sources |
| --- | --- | --- | --- |
| `ui-direction` | S | Art direction and build process for new UI or a visual reshape. One merged skill, so new-UI requests trigger one entry. | frontend-design as the spine (stance, "the brief wins", AI-default traits, token plan); taste v2 as procedure and tools (subject inventory, claims before sections, direction library, `draw.mjs`, `assets.mjs`); redesign-skill as `references/redesign.md` |
| `ui-critic` | A | Renders a page headless at 1440/768/390, runs taste's lint and inspect checks, critiques the screenshots, returns at most 3 ranked fixes. An agent, so screenshots stay out of the main context. | taste v2 `inspect.mjs`, `lint.mjs`, critique and tells references; archived web-design rendered-review checklist |
| `uiux-lookup` | S | Offline search over cited UX rules, 22 stack UI guideline sets (the only native and desktop coverage), Google Fonts metadata and icons. | ui-ux-pro-max data and search, **ported from Python to Node** so the set needs one runtime |
| `web-design` | S | Extend an existing product's visual system. | archive, small edits |
| `screen-reader-testing` | S | Manual assistive-technology test plans and reports. | archive |
| `accessibility-review` | S | Design-level WCAG audit. | Anthropic design plugin, **updated from WCAG 2.1 to 2.2** |
| `ux-copy` | S | Microcopy, errors, empty states, CTAs. | Anthropic design plugin |
| `design-critique` | S | Critique of mockups and screenshots without code (rendered pages go to `ui-critic`). | Anthropic design plugin |
| `design-system` | S | Audit, document or extend a design system. | Anthropic design plugin. Draw its boundary against `web-design` at port time; if they overlap too much, its code-side parts become a `web-design` reference |
| `design-handoff` | S | Developer handoff specs. | Anthropic design plugin |

Rules for this collection:

- **Taste's absolutes become warnings.** Its owner-taste bans (monospace, index numbers, hairlines) and the motion and picture quotas yield to "the brief wins". Its "decide and state your reading" replaces frontend-design's "confirm with the client".
- **Network imagery stays, licenses opt-in.** `assets.mjs` fetches from open collections with CC0, public domain and CC BY by default; share-alike only when asked.
- **ui-ux-pro-max's aesthetic data is dropped:** its palettes (Tailwind defaults), font pairings, style picks and design-system generator. Its six "claudekit" skills are dropped too: they read `~/.claude/.env`, send API keys to external image services and run `npx shadcn`.
- **Security fixes in taste's scripts:** the inspector must serve only the target directory on loopback, not the whole working directory, and the direction script must keep its history inside the project, not `~/.taste-skill/`.
- **The browser comes from the system.** `ui-critic` uses an installed Chrome, Chromium or Edge (`CHROME_PATH` overrides) and reports clearly when none is found. This host has Google Chrome 155 at `/usr/bin/google-chrome-stable`, which taste's `findChrome()` already checks.
- **Don't install the upstream copies alongside:** `frontend-design@claude-plugins-official`, `taste-skill@taste-skill` or the claude.ai-synced `design` plugin would double the triggers. Keep `design@synced` disabled once the ports ship.
- **Attribution:** ship the Apache-2.0 and MIT license texts and a NOTICE marking the frontend-design and design-plugin files as modified. Not ported from the design plugin: `user-research` and `research-synthesis`.
- **To verify when building:** whether `${CLAUDE_PLUGIN_ROOT}` expands inside a plugin agent's prompt, so `ui-critic` can reach its scripts. The design doc describes a fallback path lookup.

### 10. Shared rules for every port

- Rename `plugin:skill` cross-references to the new one-plugin names, and drop links to plugins that won't return.
- Replace `codegraph_explore` and `.codegraph/` hints with codebase-memory tools (`search_graph`, `trace_path`, `get_code_snippet`, `get_architecture`).
- Drop `claude-mem`, `dynamic-workflows` and "prefer the github MCP server" lines.
- Trim descriptions. Many archived ones exceed 500 characters because of long "Not for ..." lists.
- Keep upstream attribution lines (MIT and Apache-2.0 notices). Strip ECC's pasted "Prompt Defense Baseline" from any agent.
- Version-sensitive facts (Vite, Cypress, Prisma, uv, model names in second-opinion) get rechecked with Context7 at port time.
- `bash-danger-guard`, `cloud-ops-guard` and `readonly-agent-gate` all vendor the same shell walker. Keep one canonical copy and sync it with a script.

## Adoption list

Type: S skill, A agent, H hooks.json, M mod, P MCP server. "Manual" means `disable-model-invocation`, so the skill costs nothing in the listing.

### Programming core and baseline

| Plugin | Type | Source | Destination | Notes |
| --- | --- | --- | --- | --- |
| `git-commit` | S | archive git/commit | baseline | Absorbs branch-naming detection from git/branch. |
| `recommend-plugins` | S manual | archive setup | baseline | Rewrite for metas, focused plugins and cross-deps. |
| `handoff` | S manual | mattpocock handoff (+ claude-handoff as a `--bg` option) | baseline | |
| `check-bypass-guard` | H | ECC config-protection + block-no-verify; wshobson block-no-verify | baseline | Use `ask`, not exit 2, for config edits. |
| `bash-danger-guard` | M | archive coremods tool-mgr danger rules | baseline | Only the danger rules. The sed/heredoc hygiene rules are dropped. |
| `git-statusline` | M | archive coremods git-line | baseline | + worktree marker, unpushed-commit colour, stash count. |
| `usage-band` | M | archive coremods usage-band | baseline | + the decision 8 enhancements. |
| `mcp-health` | M | new, from claude-hud | baseline | |
| `coding` | S | archive coding-core/coding | programming-core | + ponytail ruleset, anti-slop "remove first", ECC search-first rules. |
| `problem-solving` | S | archive coding-core/problem-solving | programming-core | + mattpocock diagnose feedback-loop gate. |
| `planning` | S | archive coding-core/planning | programming-core | + grill, EARS syntax from claude-skills feature-forge. |
| `unit-testing` | S | archive testing/unit | programming-core | + mattpocock tdd, pytest and Vitest references. |
| `test-run` | S manual | archive testing/run | programming-core | Runner detection scripts and compact failure output. |

### Stack skills

| Plugin | Type | Source | Destination | Notes |
| --- | --- | --- | --- | --- |
| `python` | S | archive coding-python/python | python-meta | + wshobson anti-patterns and typing references. |
| `python-packaging` | S | archive coding-python/python-packaging | python-meta | Recheck uv facts; wshobson uv deltas. |
| `dependency-vetting` | S | cybersecurity npm malware, typosquat, dependency confusion | python-meta, node-typescript-meta | Generalize to PyPI. Review or drop `agent.py`. Apache-2.0. |
| `golang` | S | archive coding-go/golang | golang-meta | samber/cc-skills-golang attribution. |
| `rust` | S | archive coding-rust/rust | rust-meta | |
| `javascript` | S | archive coding-js/javascript | node-typescript-meta | |
| `typescript` | S | archive coding-js/typescript | node-typescript-meta | + wshobson advanced-types reference. |
| `terraform` | S | archive infra/terraform | iac-meta | + Terratest and security-scanning references (trivy config, not tfsec). Bring its 6 trigger evals. |
| `ansible` | S | archive infra/ansible | iac-meta | |
| `docker` | S | archive deploy/docker | iac-meta | + daemon hardening reference. |
| `bash` | S | archive coding-shell/bash | iac-meta | + wshobson shellcheck and bats deltas. |
| `cloud-ops-guard` | H | archive infra hook | iac-meta | Needs bun. |
| `devops` | A | archive crew/devops | iac-meta | Read-only by default; points at the terraform, docker and kubernetes skills. |
| `kubernetes`, `helm`, `gitops` | S | archive deploy | kubernetes-meta or direct | + Pod Security Admission reference. |

### GitHub and web

| Plugin | Type | Source | Destination | Notes |
| --- | --- | --- | --- | --- |
| `gh-issues`, `gh-pr`, `pr-comments`, `ship` | S | archive github | github-meta | Drop GitHub MCP lines. `ship` depends on `shipper`. |
| `shipper` | A | archive github/agents | github-meta | Depends on `git-commit`. |
| `gh-actions` | S | archive github-admin/actions | github-meta | + cybersecurity Actions-hardening deltas. |
| `dependabot` | S | archive github-admin (+ dependabot-prs) | github-meta | |
| `gh-release`, `gh-triage`, `gh-code-security`, `gh-repo-setup`, `issue-breakdown` | S | archive github, github-admin | direct | Admin or occasional jobs. |
| `web-development` | S | archive web | web-meta | |
| `web-design`, `screen-reader-testing` | S | archive web, accessibility | design-core | Fix the `ui-ux-pro-max` mention in web-design's description. |
| `ui-direction`, `ui-critic` (A), `accessibility-review`, `ux-copy` | S/A | decision 9 | design-core | New. |
| `uiux-lookup`, `design-critique`, `design-system`, `design-handoff` | S | decision 9 | design-meta | New. |
| `web-perf-auditor` | A | agent-skills web-performance-auditor | web-meta | New. |
| `react`, `vite` | S | archive coding-js | web-meta | |
| `e2e-testing` | S | archive testing/e2e | web-meta | |
| `playwright-cli` | S | archive playwright-cli | web-meta | |
| `browser-tester` | A | archive crew | web-meta | Rewrite onto playwright-cli. |
| `vue`, `tanstack`, `click-path-audit` | S | archive coding-js | direct | |

### Direct installs (no meta)

| Area | Plugins |
| --- | --- |
| API | `api-rest-design` (+ versioning), `api-idempotency`, `api-webhooks`, `api-keys`, `api-oauth-provider`, `api-graphql`, `api-grpc` |
| AWS | `aws-resource-query`, `aws-cloudwatch`, `aws-well-architected` |
| Databases | `db-schema-design` (+ crew dba safety rules), `postgres` (+ wshobson table-design gotchas, query tuning, pgvector), `mysql`, `redis`, `prisma` (new, from ECC) |
| Deploy and ops | `rollout-plan`, `production-readiness`, `observability-instrumentation`, `promql`, `grafana-dashboards`, `postmortem` |
| Security | `security-scan` (manual; + SBOM and security-auditor checklist), `threat-model`, `privacy-review`, `mcp-server-audit` (new) |
| MCP authoring | `mcp-server` (+ design), `mcp-server-review` |
| Go and Python extras | `golang-cli`, `golang-performance`, `fastapi` |
| Auth | `app-auth`, `better-auth` (confirm it was rewritten from docs; upstream has no license) |
| Review and critique | `poka-yoke`, `review-loop`, `second-opinion` + `consult` (M), `the-fool` (new), `doubt-review` (new) |
| Design and docs | `codebase-design` (new, mattpocock + improve-codebase-architecture), `domain-modeling`, `adr-writing`, `docs-audit`, `agent-instructions`, `deprecation-migration` (new) |
| Repo and config | `pre-commit` (+ hook-repair), `agent-config-audit` (+ mcp-dependency-review), `config-audit`, `devcontainer` (new), `plugin-vetter` (new A, alongside agent-config-audit) |
| Workflow | `implement-plan`, `research`, `prototype`, `experiment-loop`, `modernize`, `session-retro` (new), `setup-wizard` (new), `test-gap-audit`, `git-history` (+ rebase safety rules) |
| Tools | `devenv`, `chezmoi`, `pass-cli`, `termwright`, `homelab-network`, `esp-idf`, `grep-app` (P) |
| Observability vendor | `sentry-sdk`, `sentry-mcp-self-hosted` (P, pin `@sentry/mcp-server` to a fixed version). The hosted `sentry-mcp` is not adopted. |
| Specialized agents | `dba` (with the database skills), `security-auditor` (with the security skills) |
| Mods | `agent-status` (+ model and time since spawn), `cache-clock` (new), `turn-stats` (new) |
| Extra ports | `open-source-release-audit` (A, from ECC), `file-conversion` (from wshobson), `ts-module-boundaries` (from mattpocock) |

### Not adopted

| What | Why |
| --- | --- |
| CodeGraph skill, MCP server, guideline mod, autoinit hook; testing harness | codebase-memory-mcp replaces them. |
| crew Explore agent, orchestration-guard hooks, system prompt override | Built-in Explore plus the codebase-memory agents cover exploration. The guard hooks and copied system prompt drift with each release; `agent-router` replaces the hard-coded routing. |
| coremods git-tools, tool-mgr hygiene rules, systemone, DuckDB metrics | No standalone value, contradict current harness guidance, or too heavy. |
| context7, ripgrep and grep-app skills; worktree, agent-teams, create-skill, map-codebase, editorconfig | Built-ins, server instructions, codebase-memory or repo-local skills cover them. |
| GitHub, Exa, Playwright and AWS MCP servers | `gh`, claude.ai connectors and CLI skills do the same with less context. |
| Upstream ponytail plugin | Ruleset merged into `coding`; its 5 extra skills, per-prompt node hook and band mod cost too much. |
| Language and framework "pro" skills from claude-skills, ECC and wshobson | Generic, often stale, and weaker than the archived versions. |
| All wshobson and ECC persona agents and commands | Auto-delegating "Use PROACTIVELY" personas with mis-graded severities; overlap built-ins. |
| Vendor-specific sets (Azure, Power Platform, .NET, Java, SEO, game dev) | Off-stack. Install claude-seo or the game-dev bundles directly from upstream when needed. |
| Offensive and SOC content in the cybersecurity set | Unsafe to ship by default, or enterprise tooling. |

## Phases

Each phase ports with `scripts/plugins.py new`, applies the shared rules, and ships with `ship-plugin`.

1. **Baseline and core.** The baseline and programming-core rows. About 12 plugins.
2. **Stack metas.** Stack skills and the LSP dependencies. About 14 plugins.
3. **GitHub, web, design and Kubernetes.** Fill `github-meta`, `web-meta`, `design-core`, `design-meta` and `kubernetes-meta`. About 30 plugins.
4. **Orchestration.** `orchestration`, `agent-router`, the five general agents and `readonly-agent-gate`. About 8 plugins.
5. **Direct installs from the archive.** API, AWS, databases, deploy, security, MCP, tools and specialized agents. About 45 plugins.
6. **New third-party ports.** `prisma`, `dependency-vetting` (if not done in 2), `mcp-server-audit`, `the-fool`, `doubt-review`, `codebase-design`, `deprecation-migration`, `session-retro`, `setup-wizard`, `devcontainer`, `plugin-vetter`, then the extra ports.

Consider extending `scripts/plugins.py new` with a `--from <path>` option that copies an archived skill directory, so ports keep their references and scripts.

## Checks before acting on this plan

- **Mods registering one event twice.** `CLAUDE.md` says the engine refuses a plugin that registers the same event twice. claude-seo's seo-cockpit calls `on('tool.call')` three times with different matchers in one module. The published `claude-code.d.ts` doesn't settle it. Test before splitting coremods or citing seo-cockpit in `mod-authoring`.
- **`mcp-scan` name.** Confirm the current package and CLI name now that Invariant Labs is part of Snyk.
- **`better-auth` provenance.** Confirm the archived skill was rewritten from the docs.

## Open questions

None open. Answered on 2026-10-17: programming core lives in the `programming-core` bundle that the language and web metas list; create `github-meta`, `web-meta`, `kubernetes-meta` and `orchestration-meta`; Sentry is self-hosted; prefix only collision-prone names, and the core skills and general agents stay bare; specialized agents go with their skills; every archived plugin is split into focused plugins; `baseline` gets `git-statusline`, `usage-band` and `mcp-health`; build `agent-status`, `cache-clock` and `turn-stats` as direct installs; port `open-source-release-audit`, `file-conversion` and `ts-module-boundaries`, and drop `cypress-flake-fixer`. UI/UX: one merged `ui-direction` skill; a `design-core` bundle listed by `web-meta` and a new `design-meta`; keep network imagery with opt-in licenses; drop ui-ux-pro-max's aesthetic data; port our own versions of the design plugin skills; names `ui-direction`, `ui-critic`, `uiux-lookup`; use the system browser (Chrome is installed); port the lookup search to Node.
