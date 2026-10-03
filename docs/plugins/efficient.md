# efficient

Cost-conscious engineering skills for Claude Code, split into 11 `efficient-*` plugins so a project enables only what it uses. The family covers coding, planning, debugging, testing, security review, research, experiments, prototypes, modernization, web work, and guidance for languages, frameworks, databases, and auth. It adds 41 skills and no hooks or agents. Five skills ship scripts. Claude loads each skill on demand when its description matches the task, except three manual-only commands.

The family replaces the former `efficient` and `quality` plugins, which no longer exist. Two former `quality` skills moved outside the family: `agent-config-audit` to [authoring](authoring.md) and `production-readiness` to [infra](infra.md). The plugins have no dependencies on each other. Five language plugins depend on an LSP plugin from the third-party `claude-code-lsps` marketplace (see [LSP servers](#lsp-servers)). A skill that mentions a skill in another plugin says "if installed".

## Plugins

| Plugin | Skills | Holds |
| --- | --- | --- |
| `efficient-core` | 10 | Process skills used in every project, plus the reviewers the `architect`, `review`, and `quick-review` agents preload |
| `efficient-testing` | 5 | Unit, end-to-end, and regression tests; the test runner; the test harness; test-gap audits |
| `efficient-security` | 3 | Threat models, privacy review, and a manual security scan |
| `efficient-go` | 3 | The Go language, CLI tools, and performance |
| `efficient-python` | 3 | Python, packaging, and FastAPI |
| `efficient-js` | 7 | JavaScript, TypeScript, React, Vue, Vite, TanStack, and UI click-path audits |
| `efficient-rust` | 1 | Rust |
| `efficient-shell` | 1 | Bash scripting. Home for future shell-specific skills |
| `efficient-web` | 2 | Front-end web development and web design |
| `efficient-auth` | 2 | Application-side auth and Better Auth |
| `efficient-db` | 4 | Schema design, Postgres, MySQL, and Redis |

## What each plugin adds

Each description also names what the skill is not for and points to the sibling that is. The grouping keeps dense routing clusters, such as `postgres`, `mysql`, and `redis`, inside one plugin.

### efficient-core

| Skill | Purpose |
| --- | --- |
| `efficient-core:coding` | Smallest correct change for a bounded feature, fix, or behavior-preserving refactor |
| `efficient-core:planning` | Write or review a plan whose scope and verification are proportionate to risk |
| `efficient-core:problem-solving` | Diagnose a failure through reproduction and root-cause evidence, or pick an algorithm under constraints |
| `efficient-core:research` | Answer an external question from weighed sources with citations |
| `efficient-core:prototype` | Throwaway prototype that answers one design question: a single-file HTML logic demo, or UI variants on one route |
| `efficient-core:experiment-loop` | Bounded, unattended optimize-and-measure loop on a dedicated branch: one hypothesis per commit, a fixed metric command, keep-or-revert, and a results log |
| `efficient-core:modernize` | Plan a legacy-system upgrade or migration with a feasibility spike, safety ladder, hazard review, and phased exit criteria |
| `efficient-core:second-opinion` | Read-only review of a diff or plan by a different model family (codex or agy), or a local two-reviewer gate |
| `efficient-core:anti-slop` | Cut unsupported complexity, speculative additions, dead artifacts, and filler from code, docs, or UI |
| `efficient-core:poka-yoke` | Design or audit code so a mistake cannot be expressed. Ranks hazards on a ladder from control to docs-only |

`efficient-core:coding` sends unknown-cause bugs to `efficient-core:problem-solving`.

#### Exa web search MCP server

The plugin ships an HTTP MCP server for Exa's web search API (`https://mcp.exa.ai/mcp`). It exposes `web_search_exa` (search the web), `web_fetch_exa` (read a URL), and `agent_run` for broad list-building and enrichment when exposed. The `efficient-core:research` skill routes web search requests to these tools when connected, and falls back to WebSearch/WebFetch otherwise. A verification run on 2026-10-03 exposed only `web_search_exa` and `web_fetch_exa`.

The server is always-loaded by default (alwaysLoad: true), which reserves roughly 600 tokens per request in the context window (measured on 2026-10-03 with cache reads). If you don't use the research skill, disable it by disabling the server in `/mcp` (per project), disabling the plugin itself with `claude plugin disable`, or setting `ENABLE_CLAUDEAI_MCP_SERVERS=false` in the `env` block of `~/.claude/settings.json` to disable all claude.ai connectors in Claude Code.

**OAuth sign-in:** The first request to an Exa tool may prompt a one-time OAuth sign-in for `plugin:efficient-core:exa` in `/mcp`. If the claude.ai Exa connector shadows the plugin copy, the connector's sign-in applies instead. UNCONFIRMED: a verification run connected without visible sign-in.

**Connector shadowing:** When a claude.ai Exa connector exists at the same URL (`https://mcp.exa.ai/mcp`), Claude Code uses the connector and silently drops the plugin copy, so `alwaysLoad` does not apply. To use the plugin copy instead, remove the Exa connector at claude.ai → Settings → Connectors, or set `ENABLE_CLAUDEAI_MCP_SERVERS=false` in the `env` block of `~/.claude/settings.json` (disables all claude.ai connectors in Claude Code).

### efficient-testing

| Skill | Purpose |
| --- | --- |
| `efficient-testing:unit` | Decide, write, and run focused unit or regression tests for changed behavior |
| `efficient-testing:e2e` | Write, run, and diagnose browser end-to-end tests for critical journeys |
| `efficient-testing:run` | Run the project's tests, show only compact failures, and fix them in a bounded loop. Manual: `/efficient-testing:run` |
| `efficient-testing:harness` | Generate unit and integration tests for changed functions, run them with the `run` runner, and return a compact report. Manual: `/efficient-testing:harness [path\|symbol]` |
| `efficient-testing:gap-audit` | Read-only audit of missing, weak, and stale tests. Maps source files to tests with a bundled script, ranks gaps P0 to P3 by behavior and risk (not coverage percentage), and proposes exact tests |

`harness` calls the `run` runner through `${CLAUDE_PLUGIN_ROOT}`, which is why the testing skills share a plugin.

### efficient-security

| Skill | Purpose |
| --- | --- |
| `efficient-security:threat-model` | STRIDE threat model built from the code: trust boundaries, a data-flow diagram, verified gaps tiered by exploitability, testable requirements, and incremental reruns against a baseline |
| `efficient-security:privacy-review` | Inventory personal data across models, logs, telemetry, and third-party calls. Traces where it flows and rests, and checks minimization, retention, erasure, and export. Not legal advice |
| `efficient-security:audit` | Scan the branch's changes and dependencies, have a subagent verify findings, and report a ranked table. Manual: `/efficient-security:audit [base-ref]` |

### efficient-go

| Skill | Purpose |
| --- | --- |
| `efficient-go:golang` | Idiomatic Go: errors, context, goroutine lifecycles, tests |
| `efficient-go:golang-cli` | Go command-line tools with cobra and viper: flag and config precedence, exit codes, signal shutdown |
| `efficient-go:golang-performance` | Measurement-first Go performance: benchmarks with benchstat, pprof, escape analysis, GC tuning |

Installing `efficient-go` also installs the `gopls` LSP plugin, which installs `gopls` if it is missing.

### efficient-python

| Skill | Purpose |
| --- | --- |
| `efficient-python:python` | Python typing, exceptions, asyncio, profiling, and pytest |
| `efficient-python:python-packaging` | Build and validate installable Python distributions |
| `efficient-python:fastapi` | Bounded changes to existing FastAPI apps |

Installing `efficient-python` also installs the `pyright` LSP plugin, which installs `pyright-langserver` if it is missing.

### efficient-js

| Skill | Purpose |
| --- | --- |
| `efficient-js:javascript` | JavaScript runtime semantics: modules, promises, the event loop |
| `efficient-js:typescript` | Type-level and compiler work: `tsconfig`, narrowing, generics |
| `efficient-js:react` | React component boundaries, state, effects, and tests. With no profile, it gives Profiler steps first and adds no memoization until there are numbers |
| `efficient-js:vue` | Vue 3 Composition API, Pinia stores, and Nuxt 4 data fetching and hydration |
| `efficient-js:vite` | Vite configuration and build behavior: client env exposure, chunking, SSR externals, dev-server problems (Vite 7 and 8) |
| `efficient-js:tanstack` | TanStack Query, Router, Form, Table, Virtual, and Start |
| `efficient-js:click-path-audit` | Trace UI event handlers and state side effects to find sequential undo, async races, stale closures, and dead paths |

Installing `efficient-js` also installs the `vtsls` LSP plugin, which covers `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, and `.cjs` and installs `vtsls` if it is missing.

### efficient-rust, efficient-shell, efficient-web

| Skill | Purpose |
| --- | --- |
| `efficient-rust:rust` | Rust ownership, errors, Cargo, async, and unsafe review |
| `efficient-shell:bash` | Defensive Bash scripts: strict mode, quoting, traps, ShellCheck, and Bats tests |
| `efficient-web:web-development` | Build or repair a browser-facing feature end to end |
| `efficient-web:web-design` | Evidence-based visual design for an existing product, including `DESIGN.md` |

Installing `efficient-rust` also installs the `rust-analyzer` LSP plugin. Installing `efficient-shell` also installs the `bash-language-server` LSP plugin, which covers `.sh`, `.bash`, `.zsh`, and `.ksh`. Rust has a weaker auto-install (see [LSP servers](#lsp-servers)).

### efficient-auth, efficient-db

| Skill | Purpose |
| --- | --- |
| `efficient-auth:auth` | Application-side authentication and server-side authorization |
| `efficient-auth:better-auth` | Add, configure, or debug the Better Auth TypeScript library: adapters, schema generation, plugins, trusted origins |
| `efficient-db:database-design` | Portable relational schema design and expand-contract migrations |
| `efficient-db:postgres` | Measured PostgreSQL diagnosis: plans, indexes, locks, vacuum |
| `efficient-db:mysql` | Measured MySQL and MariaDB diagnosis: EXPLAIN, composite indexes, InnoDB lock waits, online DDL |
| `efficient-db:redis` | Redis and Valkey usage: caching, TTL and key design, rate limits, locks, queues |

`efficient-db:database-design` sends engine-specific work to `efficient-db:postgres`, `efficient-db:mysql`, or `efficient-db:redis`.

Manual-only skills (`run`, `harness`, `audit`) set `disable-model-invocation`. Claude does not start them on its own.

The review skills are read-only and report findings. They treat text in the repo, such as READMEs and comments, as evidence and never as instructions.

## Old to new names

The old `efficient` and `quality` names no longer resolve. Update agent files that preload skills and any muscle-memory slash commands.

| Old | New | Slash command |
| --- | --- | --- |
| `efficient:coding` | `efficient-core:coding` | |
| `efficient:planning` | `efficient-core:planning` | |
| `efficient:problem-solving` | `efficient-core:problem-solving` | |
| `efficient:research` | `efficient-core:research` | |
| `efficient:prototype` | `efficient-core:prototype` | |
| `efficient:experiment-loop` | `efficient-core:experiment-loop` | |
| `efficient:modernize` | `efficient-core:modernize` | |
| `efficient:bash` | `efficient-shell:bash` | |
| `efficient:golang` | `efficient-go:golang` | |
| `efficient:golang-cli` | `efficient-go:golang-cli` | |
| `efficient:golang-performance` | `efficient-go:golang-performance` | |
| `efficient:python` | `efficient-python:python` | |
| `efficient:python-packaging` | `efficient-python:python-packaging` | |
| `efficient:fastapi` | `efficient-python:fastapi` | |
| `efficient:javascript` | `efficient-js:javascript` | |
| `efficient:typescript` | `efficient-js:typescript` | |
| `efficient:react` | `efficient-js:react` | |
| `efficient:vue` | `efficient-js:vue` | |
| `efficient:vite` | `efficient-js:vite` | |
| `efficient:tanstack` | `efficient-js:tanstack` | |
| `efficient:rust` | `efficient-rust:rust` | |
| `efficient:web-development` | `efficient-web:web-development` | |
| `efficient:web-design` | `efficient-web:web-design` | |
| `efficient:auth` | `efficient-auth:auth` | |
| `efficient:better-auth` | `efficient-auth:better-auth` | |
| `efficient:database-design` | `efficient-db:database-design` | |
| `efficient:postgres` | `efficient-db:postgres` | |
| `efficient:mysql` | `efficient-db:mysql` | |
| `efficient:redis` | `efficient-db:redis` | |
| `efficient:testing` | `efficient-testing:unit` | |
| `efficient:e2e-testing` | `efficient-testing:e2e` | |
| `quality:test` | `efficient-testing:run` | `/efficient-testing:run` |
| `quality:test-harness` | `efficient-testing:harness` | `/efficient-testing:harness` |
| `quality:test-gap-audit` | `efficient-testing:gap-audit` | |
| `quality:second-opinion` | `efficient-core:second-opinion` | |
| `quality:anti-slop` | `efficient-core:anti-slop` | |
| `quality:poka-yoke` | `efficient-core:poka-yoke` | |
| `quality:audit` | `efficient-security:audit` | `/efficient-security:audit` |
| `quality:threat-model` | `efficient-security:threat-model` | |
| `quality:privacy-review` | `efficient-security:privacy-review` | |
| `quality:agent-config-audit` | `authoring:agent-config-audit` | |
| `quality:click-path-audit` | `efficient-js:click-path-audit` | |
| `quality:production-readiness` | `infra:production-readiness` | |

## Choose plugins

Install at user scope what every project uses. Enable the rest per project with `--scope local`, so a project lists only the skills it can use.

| Scope | Plugins | Why |
| --- | --- | --- |
| User | `efficient-core`, `efficient-testing`, `authoring` | Used in every project. `efficient-core` must be present because the `architect`, `review`, and `quick-review` agents preload `efficient-core:second-opinion` |
| User (already) | `git`, `code-search`, `github` | Unchanged |
| Per project | `efficient-go`, `efficient-python`, `efficient-js`, `efficient-rust`, `efficient-shell` | Only for the languages the project uses |
| Per project | `efficient-web`, `efficient-auth`, `efficient-db` | Only for projects with a UI, login, or a database |
| Per project | `efficient-security` | Projects that want threat models, privacy review, or `/efficient-security:audit` |
| Per project, situational | `api`, `aws`, `infra`, `observability`, `sentry`, `tooling` | Moved from user scope. Enable where the project ships that kind of work |

Example profiles, each added on top of the user-scope plugins.

| Profile | Add locally |
| --- | --- |
| Rust CLI | `efficient-rust` |
| Go service with Postgres | `efficient-go`, `efficient-db` |
| FastAPI with Postgres and auth | `efficient-python`, `efficient-web`, `efficient-auth`, `efficient-db` |
| Go and TypeScript product with UI, Postgres, auth, scripts, and infra | `efficient-go`, `efficient-js`, `efficient-web`, `efficient-auth`, `efficient-db`, `efficient-shell`, `efficient-security`, `infra` |

A missing plugin is harmless. Pointers to its skills say "if installed", and Claude falls back to its own judgment. Without `efficient-security`, use the built-in `/security-review` for a model-only read of the branch diff.

## LSP servers

Five plugins declare a required dependency on an LSP plugin from the `claude-code-lsps` marketplace ([github.com/boostvolt/claude-code-lsps](https://github.com/boostvolt/claude-code-lsps)). Installing the plugin installs the LSP plugin at the same scope, and the CLI prints `+ 1 dependency: <name>`. Each LSP plugin has a SessionStart hook that installs its server when it is missing.

| Plugin | LSP plugin | Server | Hook install when the server is missing |
| --- | --- | --- | --- |
| `efficient-go` | `gopls` | `gopls` | `go install golang.org/x/tools/gopls@latest` (needs Go) |
| `efficient-python` | `pyright` | `pyright-langserver` | `pip install pyright` (needs pip) |
| `efficient-js` | `vtsls` | `vtsls` | `npm install -g @vtsls/language-server typescript` (needs npm) |
| `efficient-rust` | `rust-analyzer` | `rust-analyzer` | `brew install rust-analyzer`. Without brew it prints instructions (`rustup component add rust-analyzer`) |
| `efficient-shell` | `bash-language-server` | `bash-language-server` | `brew install`, else `npm install -g bash-language-server` |

### Hook behavior

- The hook runs at every session start and exits silently if the server is on `PATH`.
- Otherwise it installs the latest version, unpinned.
- The hook times out at 30 seconds (60 for `rust-analyzer`). A slow `npm install` can be cut off and retries next session.
- Installs go to whichever `pip`, `npm`, or `go` is first on `PATH`. A version manager such as mise does not record them. When the manager upgrades its Node or Python, the `-g` installs are dropped and the hook reinstalls them.

### Install and removal

- The dependency is required. You cannot install `efficient-js` without `vtsls`.
- Add the marketplace first, or the dependency cannot resolve.
  ```
  claude plugin marketplace add boostvolt/claude-code-lsps
  ```
- A missing server binary breaks only the language server. The efficient plugin still loads and its skills still list.

Install each efficient plugin and its LSP plugin as a pair, at the same scope.

| Efficient plugin | LSP plugin |
| --- | --- |
| `efficient-go` | `gopls@claude-code-lsps` |
| `efficient-python` | `pyright@claude-code-lsps` |
| `efficient-js` | `vtsls@claude-code-lsps` |
| `efficient-rust` | `rust-analyzer@claude-code-lsps` |
| `efficient-shell` | `bash-language-server@claude-code-lsps` |

- Install the LSP plugin explicitly after the efficient plugin, at the same scope. See the pairing table above.
- `claude plugin prune` does not see dependencies declared on marketplace entries. Right after `claude plugin install efficient-go@adminhead --scope local`, `claude plugin prune --scope local` lists `gopls` as "no longer needed", and `-y` would remove it. The install also prints "auto-installed dependency no longer needed".
- The explicit install fixes this. The CLI reports "already installed — marked as manually installed", and prune then reports "Nothing to prune".
- Uninstalling the efficient plugin leaves the LSP plugin installed. Remove it explicitly with `claude plugin uninstall <lsp>@claude-code-lsps --scope <scope>`.
- An install made before the dependency was added (0.1.0) needs a reinstall to pull the LSP plugin. Reinstalling `efficient-go`, `efficient-js`, and `efficient-shell` pulled `gopls`, `vtsls`, and `bash-language-server`.
- Do not also enable the official `gopls-lsp`, `pyright-lsp`, or `typescript-lsp` from `claude-plugins-official` in the same project. Two servers would handle the same files.

### Security

- `claude-code-lsps` is a third-party marketplace. Its hooks run shell commands at every session start.
- Those hooks install unpinned packages from the Go proxy, PyPI, and npm.
- The marketplace is tracked at its `main` branch by choice. It was reviewed at commit `0395648`. Review its diff when you update it.

### Maintainers

- Declare the dependency on the plugin's entry in `.claude-plugin/marketplace.json`, never in `plugin.json`. A `dependencies` field in `plugin.json` makes `claude plugin eval` fail to load the plugin (`dependency-unsatisfied`). Marketplace-entry dependencies leave path-based evals alone.
- The marketplace sets `allowCrossMarketplaceDependenciesOn: ["claude-code-lsps"]`. That allowlist is what permits the cross-marketplace dependency.
- Declaring the dependency in `plugin.json` would fix `claude plugin prune`, but `claude plugin eval` then fails with `dependency-unsatisfied: Dependency "gopls@claude-code-lsps" is not installed`. Marketplace-entry dependencies stay, and the explicit LSP install step is the cost.

## Requirements

- Claude Code with plugin support.
- Most skills are guidance only and need no local tools.
- For LSP support, the `claude-code-lsps` marketplace added first, and the toolchain its hook installs with: Go, pip, npm, or brew (rustup for Rust). See [LSP servers](#lsp-servers).
- Python 3 for the `efficient-testing` `run`, `harness`, and `gap-audit` scripts and the `efficient-security` `audit` script. `coverage_map.py` uses only the standard library and runs no tests. It writes nothing and calls only `git ls-files` and `git rev-parse`.
- `git` for `harness` scope detection, `gap-audit`, and `efficient-core:experiment-loop`, which commits on a dedicated branch. The loop also needs a command that measures the goal and that you can run in the environment.
- For `efficient-security:audit`, the scanners `gitleaks`, `semgrep`, `trivy`, `govulncheck`, and `pip-audit`. A missing one is reported as "not scanned" and the rest still run.
- For `efficient-core:second-opinion`, `codex` (OpenAI) or `agy` (Google). The agy path also needs `jq`, because `consult.sh` writes a hook config that limits agy to file-reading tools. The local two-reviewer gate uses Agent subagents and needs neither CLI.
- `bash` on `PATH` for `harness` and `second-opinion`, which use bash scripts.
- Some skills name tools the project supplies, such as ShellCheck and Bats (`efficient-shell:bash`) or benchstat (`efficient-go:golang-performance`). The plugins install none of them.
- References to skills in other plugins say "if installed" or name the plugin, such as `playwright-cli:playwright-cli`, `github:actions`, `tooling:pre-commit`, or `api:oauth-provider`. `efficient-core:anti-slop` points to `avoid-ai-writing:avoid-ai-writing` for prose cleanup, and `efficient-core:research` points to `code-search:grep-app` for real-world code examples, both if installed.

## Install

Add the marketplace once.

```
claude plugin marketplace add /path/to/claude-plugins
```

Install the user-scope plugins.

```
claude plugin install efficient-core@adminhead
claude plugin install efficient-testing@adminhead
claude plugin install authoring@adminhead
```

In each project, install what it needs with `--scope local`.

```
claude plugin install efficient-go@adminhead --scope local
claude plugin install efficient-db@adminhead --scope local
```

The Go, Rust, Python, JS, and shell plugins pull in their LSP plugin at the same scope. Add the `claude-code-lsps` marketplace first, then install the LSP plugin explicitly so `claude plugin prune` keeps it.

```
claude plugin marketplace add boostvolt/claude-code-lsps
claude plugin install efficient-go@adminhead --scope local
claude plugin install gopls@claude-code-lsps --scope local
```

The other pairs are in [LSP servers](#install-and-removal).

To try one plugin without installing:

```
claude --plugin-dir plugins/efficient-core
```

## Script permissions

Each skill that runs a script grants it in `allowed-tools`, so it runs without a permission prompt while the skill is active.

| Skill | Granted command |
| --- | --- |
| `efficient-testing:run` | `python3 ${CLAUDE_SKILL_DIR}/scripts/run_tests.py *` |
| `efficient-testing:harness` | `${CLAUDE_SKILL_DIR}/scope.sh`, and `python3 ${CLAUDE_PLUGIN_ROOT}/skills/run/scripts/run_tests.py *` |
| `efficient-testing:gap-audit` | `python3 ${CLAUDE_SKILL_DIR}/scripts/coverage_map.py`, with or without arguments |
| `efficient-security:audit` | `python3 ${CLAUDE_SKILL_DIR}/scripts/scan.py`, with or without arguments |
| `efficient-core:second-opinion` | `${CLAUDE_SKILL_DIR}/scripts/consult.sh *` |

For a directory marketplace, `${CLAUDE_SKILL_DIR}` resolves to the marketplace source directory, not the plugin cache.

## Verify

1. Validate each plugin, for example `efficient-core`.
   ```
   claude plugin validate --strict plugins/efficient-core
   ```
2. Start a fresh session and check the skill list. It should show the installed skills as `<plugin>:<name>` and no `efficient:` or `quality:` names.
3. Run `/efficient-testing:run` in a repo with tests. It should run the suite without a permission prompt.
4. Run `/efficient-security:audit` in a repo with `efficient-security` installed. It should run `scan.py` without a permission prompt.

## Limits

- Skills load by description match. A task that fits no description loads nothing.
- Nothing is enforced. The skills shape how Claude works and do not block any tool.
- Plugin skills ignore `skillOverrides`, so a plugin is the smallest unit you can switch off per project.
- Per-project install lowers per-turn tokens only once the enabled skills fit the listing budget. Above it, Claude Code keeps every name and drops descriptions, least-used skills first.
- `efficient-core:experiment-loop` runs unattended only after you confirm its setup table. Confirm the scope, budget, and boundary before you say yes, because the loop cannot ask mid-run.
- Near neighbors, such as `efficient-db:postgres`, `efficient-db:mysql`, and `efficient-db:redis`, are split by their descriptions. A borderline prompt can load either one. Name the skill to force it.
- Boundaries between plugins (testing and language, core and language, web and auth) are routed by description only and are not covered by routing evals.
- `efficient-core:second-opinion` can send files to an outside model without a prompt. Its grant covers `consult.sh --input FILE` and `consult.sh --repo DIR`, so any readable file or directory can go to OpenAI (codex) or Google (agy). Use it only on content you may share.
- `efficient-core:second-opinion` was not live-run during the migration, because that would send content to an external service. Its script paths and grant are checked, and its behavior is not.
- `efficient-security:audit` reports only what the installed scanners find. Unscanned areas show as "not scanned".
- `efficient-security:threat-model` reports threats and proposes controls. It never marks a threat accepted for you.
- `efficient-security:privacy-review` is not legal advice and does not decide legal basis.
- `efficient-testing:gap-audit` matches source to tests by name, mirrored path, import, and mention. Coverage that arrives through fixtures, end-to-end tests, or indirection is invisible to it, so an unmatched file is a lead to confirm and not a finding.
- `efficient-testing:harness` and `efficient-security:audit` were not run end to end during the migration.
- `efficient-js:click-path-audit` is model-driven and runs no script. It sits beside `efficient-js:react`, which handles component and state design.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable efficient-core@adminhead` |
| Uninstall | `claude plugin uninstall efficient-core@adminhead` |

Use the plugin name you want to remove, and add `--scope local` for a per-project install. The plugins ship only skills and a few scripts, so both commands remove everything. Start a new session to be sure they are gone.

For `efficient-go`, `-rust`, `-python`, `-js`, and `-shell`, the LSP plugin stays installed. Remove it explicitly, for example `claude plugin uninstall gopls@claude-code-lsps --scope local`. Do not rely on `claude plugin prune`, which skips an LSP plugin that was installed explicitly.
