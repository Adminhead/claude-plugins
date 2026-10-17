# coding

Skills for writing code: the process skills in `coding-core`, and one plugin per language family (`coding-go`, `coding-python`, `coding-js`, `coding-rust`, `coding-shell`, `coding-esp`). `coding-core` is in the `baseline` set. Each language plugin is opt-in per project, and most of them pair with an LSP plugin. The family adds 20 skills and no hooks or agents. Claude loads each skill on demand when its description matches the task.

## Plugins

| Plugin | Skills | Holds |
| --- | --- | --- |
| `coding-core` | 4 | Process skills used in every project. Crew agents preload some of them |
| `coding-go` | 3 | The Go language, CLI tools, and performance |
| `coding-python` | 3 | Python, packaging, and FastAPI |
| `coding-js` | 7 | JavaScript, TypeScript, React, Vue, Vite, TanStack, and UI click-path audits |
| `coding-rust` | 1 | Rust |
| `coding-shell` | 1 | Bash scripting. Home for future shell-specific skills |
| `coding-esp` | 1 | ESP32 firmware with ESP-IDF. Home for future ESP-specific skills |

## What each plugin adds

### coding-core

| Skill | Purpose |
| --- | --- |
| `coding-core:coding` | Smallest correct change for a bounded feature, fix, or behavior-preserving refactor |
| `coding-core:planning` | Write or review a plan whose scope and verification are proportionate to risk. It reviews the plan for gaps, asks blocking questions, and saves the plan before it finalizes |
| `coding-core:problem-solving` | Diagnose a failure through reproduction and root-cause evidence, or pick an algorithm under constraints |
| `coding-core:implement-plan` | Execute an approved multi-slice plan file: parallel worktrees, check, review, commit, and update Status per slice |

`coding-core:coding` sends unknown-cause bugs to `coding-core:problem-solving`.

`coding-core:implement-plan` runs an approved plan, committing each slice after its checks and review. It uses `review:review-loop` for non-trivial slices. `review` is in `baseline`, so the hand-off works when `baseline` is installed.

### coding-go

| Skill | Purpose |
| --- | --- |
| `coding-go:golang` | Idiomatic Go: errors, context, goroutine lifecycles, tests |
| `coding-go:golang-cli` | Go command-line tools with cobra and viper: flag and config precedence, exit codes, signal shutdown |
| `coding-go:golang-performance` | Measurement-first Go performance: benchmarks with benchstat, pprof, escape analysis, GC tuning |

Installing `coding-go` also installs the `gopls` LSP plugin, which installs `gopls` if it is missing.

### coding-python

| Skill | Purpose |
| --- | --- |
| `coding-python:python` | Python typing, exceptions, asyncio, profiling, and pytest |
| `coding-python:python-packaging` | Build and validate installable Python distributions |
| `coding-python:fastapi` | Bounded changes to existing FastAPI apps |

Installing `coding-python` also installs the `pyright` LSP plugin, which installs `pyright-langserver` if it is missing.

### coding-js

| Skill | Purpose |
| --- | --- |
| `coding-js:javascript` | JavaScript runtime semantics: modules, promises, the event loop |
| `coding-js:typescript` | Type-level and compiler work: `tsconfig`, narrowing, generics |
| `coding-js:react` | React component boundaries, state, effects, and tests. With no profile, it gives Profiler steps first and adds no memoization until there are numbers |
| `coding-js:vue` | Vue 3 Composition API, Pinia stores, and Nuxt 4 data fetching and hydration |
| `coding-js:vite` | Vite configuration and build behavior: client env exposure, chunking, SSR externals, dev-server problems (Vite 7 and 8) |
| `coding-js:tanstack` | TanStack Query, Router, Form, Table, Virtual, and Start |
| `coding-js:click-path-audit` | Trace UI event handlers and state side effects to find sequential undo, async races, stale closures, and dead paths |

Installing `coding-js` also installs the `vtsls` LSP plugin, which covers `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, and `.cjs` and installs `vtsls` if it is missing.

### coding-rust, coding-shell

| Skill | Purpose |
| --- | --- |
| `coding-rust:rust` | Rust ownership, errors, Cargo, async, and unsafe review |
| `coding-shell:bash` | Defensive Bash scripts: strict mode, quoting, traps, ShellCheck, and Bats tests |

Installing `coding-rust` also installs the `rust-analyzer` LSP plugin. Installing `coding-shell` also installs the `bash-language-server` LSP plugin, which covers `.sh`, `.bash`, `.zsh`, and `.ksh`. Rust has a weaker auto-install (see [LSP servers](#lsp-servers)).

### coding-esp

| Skill | Purpose |
| --- | --- |
| `coding-esp:firmware-engineer` | Write, review, debug, and bring up ESP-IDF firmware: FreeRTOS, peripherals, Wi-Fi/BLE, OTA, Secure Boot and flash encryption, LVGL, sleep, panics |

Ported from [adamlipecz/esp32-firmware-engineer-skill](https://github.com/adamlipecz/esp32-firmware-engineer-skill), which has no license. Its build, flash, and monitor wrappers ship as templates to copy into a project, not as scripts the skill runs. The skill asks before steps that touch a real device or can't be undone, such as flashing, erasing, and burning eFuses.

## Choose plugins

`baseline` installs `coding-core` at user scope. Add a language plugin per project with `--scope local`, so a project lists only the languages it uses.

| Scope | Plugins | Why |
| --- | --- | --- |
| User | `baseline` (includes `coding-core`) | Used in every project |
| Per project | `coding-go`, `coding-python`, `coding-js`, `coding-rust`, `coding-shell` | Only for the languages the project uses |
| Per project | `coding-esp` | ESP32 firmware projects |

Example profiles, each added on top of the default set. The web, auth, db, and security plugins are on their own pages.

| Profile | Add locally |
| --- | --- |
| Rust CLI | `coding-rust` |
| Go service with Postgres | `coding-go`, `db` |
| FastAPI with Postgres and auth | `coding-python`, `web`, `auth`, `db` |
| Go and TypeScript product with UI, Postgres, auth, scripts, and infra | `coding-go`, `coding-js`, `web`, `auth`, `db`, `coding-shell`, `security`, `infra` |

## LSP servers

Five plugins declare a required dependency on an LSP plugin from the `claude-code-lsps` marketplace ([github.com/boostvolt/claude-code-lsps](https://github.com/boostvolt/claude-code-lsps)). Installing the plugin installs the LSP plugin at the same scope, and the CLI prints `+ 1 dependency: <name>`. Each LSP plugin has a SessionStart hook that installs its server when it is missing.

| Plugin | LSP plugin | Server | Hook install when the server is missing |
| --- | --- | --- | --- |
| `coding-go` | `gopls` | `gopls` | `go install golang.org/x/tools/gopls@latest` (needs Go) |
| `coding-python` | `pyright` | `pyright-langserver` | `pip install pyright` (needs pip) |
| `coding-js` | `vtsls` | `vtsls` | `npm install -g @vtsls/language-server typescript` (needs npm) |
| `coding-rust` | `rust-analyzer` | `rust-analyzer` | `brew install rust-analyzer`. Without brew it prints instructions (`rustup component add rust-analyzer`) |
| `coding-shell` | `bash-language-server` | `bash-language-server` | `brew install`, else `npm install -g bash-language-server` |

### Hook behavior

- The hook runs at every session start and exits silently if the server is on `PATH`.
- Otherwise it installs the latest version, unpinned.
- The hook times out at 30 seconds (60 for `rust-analyzer`). A slow `npm install` can be cut off and retries next session.
- Installs go to whichever `pip`, `npm`, or `go` is first on `PATH`. A version manager such as mise does not record them. When the manager upgrades its Node or Python, the `-g` installs are dropped and the hook reinstalls them.

### Install and removal

- The dependency is required. You cannot install `coding-js` without `vtsls`.
- Add the marketplace first, or the dependency cannot resolve.
  ```
  claude plugin marketplace add boostvolt/claude-code-lsps
  ```
- A missing server binary breaks only the language server. The coding plugin still loads and its skills still list.

Install each coding plugin and its LSP plugin as a pair, at the same scope.

| Coding plugin | LSP plugin |
| --- | --- |
| `coding-go` | `gopls@claude-code-lsps` |
| `coding-python` | `pyright@claude-code-lsps` |
| `coding-js` | `vtsls@claude-code-lsps` |
| `coding-rust` | `rust-analyzer@claude-code-lsps` |
| `coding-shell` | `bash-language-server@claude-code-lsps` |

- Install the LSP plugin explicitly after the coding plugin, at the same scope. See the pairing table above.
- `claude plugin prune` does not see dependencies declared on marketplace entries. Right after `claude plugin install coding-go@adminhead --scope local`, `claude plugin prune --scope local` lists `gopls` as "no longer needed", and `-y` would remove it. The install also prints "auto-installed dependency no longer needed".
- The explicit install fixes this. The CLI reports "already installed — marked as manually installed", and prune then reports "Nothing to prune".
- Uninstalling the coding plugin leaves the LSP plugin installed. Remove it explicitly with `claude plugin uninstall <lsp>@claude-code-lsps --scope <scope>`.
- Do not also enable the official `gopls-lsp`, `pyright-lsp`, or `typescript-lsp` from `claude-plugins-official` in the same project. Two servers would handle the same files.

### Security

- `claude-code-lsps` is a third-party marketplace. Its hooks run shell commands at every session start.
- Those hooks install unpinned packages from the Go proxy, PyPI, and npm.
- The marketplace is tracked at its `main` branch by choice. It was reviewed at commit `0395648`, a 2026-05-27 kotlin-lsp fix that is in the upstream repo (checked 2026-10-13). The local clone at `351b4e08` doesn't contain that commit. Review its diff when you update it.

### Maintainers

- Declare the dependency on the plugin's entry in `.claude-plugin/marketplace.json`, never in `plugin.json`. A `dependencies` field in `plugin.json` makes `claude plugin eval` fail to load the plugin (`dependency-unsatisfied`). Marketplace-entry dependencies leave path-based evals alone.
- The marketplace sets `allowCrossMarketplaceDependenciesOn: ["claude-code-lsps"]`. That allowlist is what permits the cross-marketplace dependency.
- Declaring the dependency in `plugin.json` would fix `claude plugin prune`, but `claude plugin eval` then fails with `dependency-unsatisfied: Dependency "gopls@claude-code-lsps" is not installed`. Marketplace-entry dependencies stay, and the explicit LSP install step is the cost.

## Requirements

- Claude Code with plugin support.
- Most skills are guidance only and need no local tools.
- For LSP support, the `claude-code-lsps` marketplace added first, and the toolchain its hook installs with: Go, pip, npm, or brew (rustup for Rust). See [LSP servers](#lsp-servers).
- Some skills name tools the project supplies, such as ShellCheck and Bats (`coding-shell:bash`) or benchstat (`coding-go:golang-performance`). The plugins install none of them.

## Install

Add the marketplace once, then install `coding-core` through `baseline`, as described in [baseline](baseline.md).

In each project, install a language plugin with `--scope local`.

```
claude plugin install coding-go@adminhead --scope local
claude plugin install coding-python@adminhead --scope local
```

The Go, Rust, Python, JS, and shell plugins pull in their LSP plugin at the same scope. Add the `claude-code-lsps` marketplace first, then install the LSP plugin explicitly so `claude plugin prune` keeps it.

```
claude plugin marketplace add boostvolt/claude-code-lsps
claude plugin install coding-go@adminhead --scope local
claude plugin install gopls@claude-code-lsps --scope local
```

The other pairs are in [Install and removal](#install-and-removal).

To try one plugin without installing:

```
claude --plugin-dir plugins/coding-core
```

## Verify

1. Validate each plugin, for example `coding-core`.
   ```
   claude plugin validate --strict plugins/coding-core
   ```
2. Start a fresh session and check the skill list. It should show the installed skills as `<plugin>:<name>` and no `efficient:`, `efficient-*`, or `quality:` names.

## Limits

- `coding-js:click-path-audit` is model-driven and runs no script. It sits beside `coding-js:react`, which handles component and state design.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable coding-go@adminhead` |
| Uninstall | `claude plugin uninstall coding-go@adminhead` |

Use the plugin name you want to remove, and add `--scope local` for a per-project install. The plugins ship only skills and a few scripts, so both commands remove everything. Start a new session to be sure they are gone.

For `coding-go`, `coding-rust`, `coding-python`, `coding-js`, and `coding-shell`, the LSP plugin stays installed. Remove it explicitly, for example `claude plugin uninstall gopls@claude-code-lsps --scope local`. Do not rely on `claude plugin prune`, which skips an LSP plugin that was installed explicitly.

## Old to new names

The old `efficient`, `efficient-*`, and `quality` names no longer resolve. Plugin renames are automatic through the marketplace `renames` map. Skill renames across plugins are not, so update agent files that preload skills and any muscle-memory slash commands.

| Old | New | Slash command |
| --- | --- | --- |
| `efficient:coding` | `coding-core:coding` | |
| `efficient:planning` | `coding-core:planning` | |
| `efficient:problem-solving` | `coding-core:problem-solving` | |
| `efficient:research` | `research:research` | |
| `efficient:prototype` | `prototype:prototype` | |
| `efficient:experiment-loop` | `experiment-loop:experiment-loop` | |
| `efficient:modernize` | `modernize:modernize` | |
| `efficient:bash` | `coding-shell:bash` | |
| `efficient:golang` | `coding-go:golang` | |
| `efficient:golang-cli` | `coding-go:golang-cli` | |
| `efficient:golang-performance` | `coding-go:golang-performance` | |
| `efficient:python` | `coding-python:python` | |
| `efficient:python-packaging` | `coding-python:python-packaging` | |
| `efficient:fastapi` | `coding-python:fastapi` | |
| `efficient:javascript` | `coding-js:javascript` | |
| `efficient:typescript` | `coding-js:typescript` | |
| `efficient:react` | `coding-js:react` | |
| `efficient:vue` | `coding-js:vue` | |
| `efficient:vite` | `coding-js:vite` | |
| `efficient:tanstack` | `coding-js:tanstack` | |
| `efficient:rust` | `coding-rust:rust` | |
| `efficient:web-development` | `web:web-development` | |
| `efficient:web-design` | `web:web-design` | |
| `efficient:auth` | `auth:auth` | |
| `efficient:better-auth` | `auth:better-auth` | |
| `efficient:database-design` | `db:database-design` | |
| `efficient:postgres` | `db:postgres` | |
| `efficient:mysql` | `db:mysql` | |
| `efficient:redis` | `db:redis` | |
| `efficient:testing` | `testing:unit` | |
| `efficient:e2e-testing` | `testing:e2e` | |
| `quality:test` | `testing:run` | `/testing:run` |
| `quality:test-harness` | `testing:harness` | `/testing:harness` |
| `quality:test-gap-audit` | `testing:gap-audit` | |
| `quality:second-opinion` | `review:second-opinion` | |
| `quality:anti-slop` | `review:anti-slop` | |
| `quality:poka-yoke` | `review:poka-yoke` | |
| `quality:audit` | `security:audit` | `/security:audit` |
| `quality:threat-model` | `security:threat-model` | |
| `quality:privacy-review` | `security:privacy-review` | |
| `quality:agent-config-audit` | `authoring:agent-config-audit` | |
| `quality:click-path-audit` | `coding-js:click-path-audit` | |
| `quality:production-readiness` | `deploy:production-readiness` | |
| `efficient-core:coding` | `coding-core:coding` | |
| `efficient-core:planning` | `coding-core:planning` | |
| `efficient-core:problem-solving` | `coding-core:problem-solving` | |
| `efficient-core:implement-plan` | `coding-core:implement-plan` | |
| `efficient-core:research` | `research:research` | |
| `efficient-core:prototype` | `prototype:prototype` | |
| `efficient-core:experiment-loop` | `experiment-loop:experiment-loop` | |
| `efficient-core:modernize` | `modernize:modernize` | |
| `efficient-core:second-opinion` | `review:second-opinion` | |
| `efficient-core:review-loop` | `review:review-loop` | |
| `efficient-core:anti-slop` | `review:anti-slop` | |
| `efficient-core:poka-yoke` | `review:poka-yoke` | |
| `infra:docker` | `deploy:docker` | |
| `infra:kubernetes` | `deploy:kubernetes` | |
| `infra:helm` | `deploy:helm` | |
| `infra:gitops` | `deploy:gitops` | |
| `infra:rollout` | `deploy:rollout` | |
| `infra:production-readiness` | `deploy:production-readiness` | |
| `infra:homelab-network` | `homelab:homelab-network` | |
| `github:actions` | `github-admin:actions` | |
| `github:code-security` | `github-admin:code-security` | |
| `github:dependabot` | `github-admin:dependabot` | |
| `github:dependabot-prs` | `github-admin:dependabot-prs` | |
| `github:repo-setup` | `github-admin:repo-setup` | |
