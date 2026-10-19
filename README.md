# claude-plugins

Claude Code plugin marketplace `adminhead`. It has three kinds of plugin:

- `baseline`, a meta plugin you install once at user scope. It pulls in the plugins every session should have.
- Project meta plugins (`python-meta`, `golang-meta`, `rust-meta`, `node-typescript-meta`, `dotnet-meta`, `web-meta`, `design-meta`, `godot-meta`, `iac-meta`, `kubernetes-meta`, `github-meta`) that you install at project scope. Each pulls in the plugins for one kind of project. `orchestration-meta` adds a main orchestration agent and a set of general-purpose agents. It leaves out the costly `coder-max` tier, which you install per repo at local scope.
- Core bundles shared by several metas: `programming-core` (general programming, installed by the language, web and game metas), `design-core` (UI and UX design, installed by `web-meta` and `design-meta`) and `gamedev-core` (engine-agnostic game development, installed by `godot-meta`). A project with two such metas gets one copy.
- Focused plugins. Each ships exactly one component: one skill, agent, hook config, or MCP server. Install them through a meta plugin or on their own.

Small plugins keep context cost down. You load only the skills and servers a project uses, and each skill's description competes with fewer others in the skill listing.

## Prerequisites

These plugins expect [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) to be installed and configured already. It is the default code intelligence: skills and agents query its code graph for symbols, call paths, and architecture before they fall back to `rg` and file reads.

The plugins do not ship it. Install it yourself. Its installer sets up its own hooks, its MCP server, and its `codebase-memory` skill in your user config, so no plugin here registers them again.

[`examples/claude-settings`](examples/claude-settings/README.md) has starting points for user, project, and local settings.

## Quick start

One script sets up a user account: it adds the marketplaces from GitHub, merges [`settings.global.json`](examples/claude-settings/settings.global.json) into `~/.claude/settings.json`, and installs at user scope every plugin that file enables: the `baseline` and `orchestration-meta` meta plugins and the `agent-status`, `cache-clock`, `turn-stats` and `usage-log` mods. Plugins the file sets to `false` from an installable marketplace, such as `exa@claude-plugins-official`, are installed and then disabled (when not installed anywhere and not enabled in your settings). It needs Node 18+ and `claude` on `PATH`.

Without a clone, in one line. The repo is private, so the request carries your GitHub CLI token:

```
curl -fsSL -H "Authorization: Bearer $(gh auth token)" https://raw.githubusercontent.com/Adminhead/claude-plugins/main/scripts/install.mjs | node --input-type=module -
```

Options go after the `-`, for example `... | node --input-type=module - --no-plugins`. The marketplace is added over git, so `gh auth status` or your SSH key must already grant access to the repo.

From a clone:

```
node scripts/install.mjs --dry-run   # show what would change
node scripts/install.mjs
```

A piped `--dry-run` on a machine without the marketplace can only show the marketplace step, because the settings example comes from the marketplace clone. Use a clone to preview everything.

The merge keeps every key the example doesn't set, such as hooks from other installers. Example values win, arrays gain the example's missing entries, and the old file is saved beside it as `settings.json.bak-<time>`. `--no-settings` and `--no-plugins` skip a step; `--settings PATH` targets another file. A rerun updates what is already installed. An installed-but-off plugin is installed and disabled only when it is installed at no scope and your settings don't enable it; a rerun does not update or re-disable it, and it keeps your choice. If `claude-plugins-official` is not registered yet, the script adds it.

To do it by hand, add the marketplace once. Use a local clone, the GitHub repo, or a git URL.

| Task | Command |
| --- | --- |
| Add from a local clone | `claude plugin marketplace add /path/to/claude-plugins` |
| Add from GitHub | `claude plugin marketplace add Adminhead/claude-plugins` |
| Add from a URL | `claude plugin marketplace add <url>` |
| Install the default set | `claude plugin install baseline@adminhead --scope user` |
| Install a stack set for a project | `claude plugin install python-meta@adminhead --scope project` |
| Install one plugin | `claude plugin install <plugin>@adminhead --scope <scope>` |
| Add the coder-max tier to one repo | `claude plugin install coder-max@adminhead --scope local` |
| Refresh the catalog | `claude plugin marketplace update adminhead` |
| Update a plugin | `claude plugin update <plugin>@adminhead --scope <scope>` |
| Remove dependencies nothing needs | `claude plugin prune` |
| List installed plugins | `claude plugin list` |

`--scope` takes `user`, `project`, or `local`. `project` writes `.claude/settings.json`, which you commit so the team gets the same set. `local` keeps the install to your own checkout. Use the scope a plugin was installed at when you update or uninstall it.

Restart Claude Code or run `/reload-plugins` to apply an install or update.

### How meta plugins behave

- Installing a meta plugin installs and enables each plugin it lists, at the same scope.
- Updating a meta plugin that lists a new plugin installs that plugin on the next update or `/reload-plugins`.
- Claude Code refuses to disable a plugin that an enabled meta plugin still lists. To drop one plugin from a set, disable the meta plugin and install the plugins you want on their own.
- Uninstalling a meta plugin leaves the plugins it installed. Run `claude plugin prune` to remove the ones nothing else needs.

`baseline` holds only plugins that are useful in every session, because you can't turn one off without turning off the whole set.

## Plugins

<!-- catalog:start -->

### Meta plugins

| Plugin | Scope | Installs | Description |
| --- | --- | --- | --- |
| [`baseline`](plugins/baseline) | user | `git-commit`, `recommend-plugins`, `handoff`, `check-bypass-guard`, `git-statusline`, `usage-band`, `mcp-health`, `bash-rules` | The adminhead default set, installed at user scope: the plugins every session should have. Ships no components of its own. |
| [`python-meta`](plugins/python-meta) | project | `programming-core`, `python`, `python-packaging`, `dependency-vetting`, `pyright@claude-code-lsps` | Plugin set for Python projects, installed at project scope. Ships no components of its own. |
| [`golang-meta`](plugins/golang-meta) | project | `programming-core`, `golang`, `gopls@claude-code-lsps` | Plugin set for Go projects, installed at project scope. Ships no components of its own. |
| [`rust-meta`](plugins/rust-meta) | project | `programming-core`, `rust`, `rust-analyzer@claude-code-lsps` | Plugin set for Rust projects, installed at project scope. Ships no components of its own. |
| [`node-typescript-meta`](plugins/node-typescript-meta) | project | `programming-core`, `javascript`, `typescript`, `dependency-vetting`, `vtsls@claude-code-lsps` | Plugin set for Node.js and TypeScript projects, installed at project scope. Ships no components of its own. |
| [`dotnet-meta`](plugins/dotnet-meta) | project | `programming-core`, `csharp-lsp@claude-plugins-official`, `csharp`, `msbuild`, `dotnet-testing`, `nuget` | Plugin set for C# and .NET projects, installed at project scope. Ships no components of its own. |
| [`web-meta`](plugins/web-meta) | project | `programming-core`, `design-core`, `web-development`, `react`, `vite`, `e2e-testing`, `playwright-cli`, `browser-tester`, `web-perf-auditor` | Plugin set for web front-end projects, installed at project scope. Ships no components of its own. |
| [`design-meta`](plugins/design-meta) | project | `design-core`, `uiux-lookup`, `design-critique`, `design-system`, `design-handoff` | Plugin set for design work (new UI direction, rendered critique, UX rules and copy, accessibility, design systems and handoff) in any repo, installed at project scope. Ships no components of its own. |
| [`godot-meta`](plugins/godot-meta) | project | `programming-core`, `gamedev-core`, `godot`, `godot-physics`, `godot-shaders`, `godot-export`, `godot-testing`, `godot-mcp-setup` | Plugin set for Godot 4 game projects, installed at project scope. Ships no components of its own. |
| [`iac-meta`](plugins/iac-meta) | project | `terraform`, `ansible`, `docker`, `bash`, `cloud-ops-guard`, `devops`, `bash-language-server@claude-code-lsps` | Plugin set for infrastructure-as-code projects, installed at project scope. Ships no components of its own. |
| [`aws-meta`](plugins/aws-meta) | project | `aws-resource-query`, `aws-cloudwatch`, `aws-well-architected`, `cloud-ops-guard`, `aws`, `aws-cli`, `aws-mcp` | Plugin set for AWS projects (credentials and IAM, CLI, the AWS MCP Server, inspection, incidents, reviews), installed at project or local scope. Ships no components of its own. |
| [`kubernetes-meta`](plugins/kubernetes-meta) | project | `kubernetes`, `helm`, `gitops`, `tilt` | Plugin set for Kubernetes projects (manifests, Helm, GitOps), installed at project scope. Ships no components of its own. |
| [`github-meta`](plugins/github-meta) | project | `gh-issues`, `gh-pr`, `pr-comments`, `ship`, `shipper`, `gh-actions`, `dependabot`, `gh-readme` | Plugin set for GitHub workflows (issues, pull requests, Actions, Dependabot), installed at project scope. Ships no components of its own. |
| [`orchestration-meta`](plugins/orchestration-meta) | user or project | `orchestration`, `agent-router`, `coder`, `architect`, `reviewer`, `debugger`, `scribe`, `readonly-agent-gate`, `coder-high`, `coder-critical` | Orchestrated sessions: a main orchestration agent, the hook that builds its routing rules from the installed agents, and a set of general-purpose agents. coder-max is not included; install it per repo at local scope. Ships no components of its own. |

### Core bundles

| Plugin | Installs | Used by | Description |
| --- | --- | --- | --- |
| [`programming-core`](plugins/programming-core) | `coding`, `problem-solving`, `planning`, `unit-testing`, `test-run`, `grep-app`, `context7@claude-plugins-official`, `feature-flags` | `dotnet-meta`, `godot-meta`, `golang-meta`, `node-typescript-meta`, `python-meta`, `rust-meta`, `web-meta` | Core bundle of general programming plugins that the language and web metas install. Ships no components of its own. |
| [`design-core`](plugins/design-core) | `ui-direction`, `ui-critic`, `web-design`, `screen-reader-testing`, `accessibility-review`, `ux-copy` | `design-meta`, `web-meta` | Core bundle of UI and UX design plugins that the web and design metas install. Ships no components of its own. |
| [`gamedev-core`](plugins/gamedev-core) | `game-design`, `game-architecture`, `game-feel`, `level-design`, `game-ui`, `game-audio`, `game-performance`, `game-playtest` | `godot-meta` | Core bundle of engine-agnostic game-development plugins that the game-engine metas install. Ships no components of its own. |

### Plugins

| Plugin | Type | Description | In |
| --- | --- | --- | --- |
| [`accessibility-review`](plugins/accessibility-review) | skill | Audits a design, mockup or page against WCAG 2.2 AA at design level: contrast, focus visibility, target size, keyboard and dragging alternatives, labels, errors and authentication. Use for "audit accessibility", "check a11y", "is this accessible?" or a WCAG check before handoff. | `design-core` |
| [`agent-router`](plugins/agent-router/README.md) | hook | Mod that lists the installed agent types, each with when to use it, in the Agent tool's description when the main thread runs the orchestration agent, so new agents get routes without editing it. | `orchestration-meta` |
| [`ansible`](plugins/ansible) | skill | Ansible skill: playbooks, roles and inventories with idempotency proof, check-mode limits, validate hooks, vault or sops secrets, and ansible-lint style. | `iac-meta` |
| [`architect`](plugins/architect) | agent | A read-only planning subagent that grounds an implementation plan in the code and returns ordered, verifiable slices with risks and rejected alternatives, optionally stress-tested by an outside model. | `orchestration-meta` |
| [`bash`](plugins/bash) | skill | Bash skill: defensive scripts with strict mode and its holes, quoting, trap cleanup, argument parsing, ShellCheck configuration and Bats tests. | `iac-meta` |
| [`browser-tester`](plugins/browser-tester) | agent | Agent that verifies a running web app in a real browser against acceptance criteria with playwright-cli, returning pass, fail or blocked per criterion with evidence. | `web-meta` |
| [`check-bypass-guard`](plugins/check-bypass-guard) | hook | Hook that denies git hook and signing bypasses (--no-verify, commit -n, --no-gpg-sign, core.hooksPath overrides, SKIP=) and asks before edits to existing lint, format and pre-commit configs or their ignore files. Needs bun. | `baseline` |
| [`click-path-audit`](plugins/click-path-audit) | skill | Audits UI event handlers for behavior bugs. It maps each state action's side effects, then traces every handler call in order to find sequential undo, async races, stale closures, dead paths and effects that reset what a click just set. Use when a button does nothing or leaves the wrong state though each function works alone, or after a shared-state refactor. | - |
| [`cloud-ops-guard`](plugins/cloud-ops-guard) | hook | PreToolUse guard (needs bun) that denies unsafe tofu, terraform and terragrunt applies, destroys, imports and state surgery, and gates subagent plan and aws calls. | `aws-meta`, `iac-meta` |
| [`coder`](plugins/coder) | agent | Coder agent, haiku tier. most bounded changes with a known approach, such as features, fixes, refactors, multi-file edits and their tests. Escalate to coder-high when a change needs deeper judgment. | `orchestration-meta` |
| [`coding`](plugins/coding) | skill | Makes the smallest complete, maintainable code change for a bounded feature, fix, integration, or behavior-preserving refactor. Use when implementing or modifying code whose approach is already clear ("add X to Y", "fix this function", "refactor this without changing behavior", "simplest solution", "this is over-engineered"). | `programming-core` |
| [`debugger`](plugins/debugger) | agent | A read-only diagnosis subagent for failures with an unknown cause: reproduce first, rank hypotheses, confirm with a probe that flips the result, and return the root cause with a fix recommendation. | `orchestration-meta` |
| [`dependabot`](plugins/dependabot) | skill | Configure and troubleshoot GitHub Dependabot (dependabot.yml ecosystems, groups, cooldown, ignore rules, private registries) and sweep open Dependabot PRs, merging only green ones. | `github-meta` |
| [`dependency-vetting`](plugins/dependency-vetting) | skill | Vet npm and PyPI packages before installing: fetch without running install code, GuardDog and OSV malware checks, lifecycle-script review, typosquat and dependency-confusion heuristics. | `node-typescript-meta`, `python-meta` |
| [`design-critique`](plugins/design-critique) | skill | Gives structured feedback on a static design (mockup, wireframe, exported Figma frame or screenshot) covering usability, hierarchy, consistency and accessibility. Use for "critique this mockup", "review this design", "what do you think of this screen?". A rendered page or built UI goes to the ui-critic agent. | `design-meta` |
| [`design-handoff`](plugins/design-handoff) | skill | Writes a developer handoff spec from a finished design: layout, tokens, component props, states and interactions, responsive breakpoints, content limits, edge cases, motion and accessibility notes. Use when a design is ready for engineering, or for "write handoff specs", "spec this screen for developers". | `design-meta` |
| [`design-system`](plugins/design-system) | skill | Audits, documents or extends a design system as a whole: token inventory, naming consistency, hardcoded values, component completeness, component docs, and proposals for a new component or pattern. Use for "audit our design system", "document this component", "design a new pattern that fits". Restyling a product screen goes to web-design. | `design-meta` |
| [`devops`](plugins/devops) | agent | Read-only-by-default infrastructure agent that reviews, validates and plans Terraform, Ansible, Docker, Kubernetes, Helm and GitOps changes using the matching skills. | `iac-meta` |
| [`docker`](plugins/docker) | skill | Docker skill: Dockerfiles, Compose and .dockerignore with multi-stage builds, non-root hardened runtime, daemon.json hardening, secret handling and container debugging. | `iac-meta` |
| [`e2e-testing`](plugins/e2e-testing) | skill | Write, run and diagnose browser end-to-end tests (Playwright, Cypress) for critical user journeys, with accessible locators, condition-based waits and flake triage. | `web-meta` |
| [`fastapi`](plugins/fastapi) | skill | Bounded changes to existing FastAPI apps: lifespan, dependencies, Pydantic models, async handlers, auth dependencies, transactions and dependency_overrides tests. | - |
| [`gh-actions`](plugins/gh-actions) | skill | Create, review, harden and debug GitHub Actions workflows and custom actions with gh: least-privilege permissions, action pinning, script-injection and pull_request_target checks, and failed-run diagnosis. | `github-meta` |
| [`gh-code-security`](plugins/gh-code-security) | skill | Configure and triage GitHub security features with gh: secret scanning, push protection and blocked-push recovery, path exclusions, private vulnerability reporting, and alert triage. | - |
| [`gh-issues`](plugins/gh-issues) | skill | Read, create, edit, close and label single GitHub issues with gh, including issue types, sub-issues, blocked-by links, milestones, Projects V2 fields and issue search. | `github-meta` |
| [`gh-pr`](plugins/gh-pr) | skill | Prepare and open a reviewer-ready GitHub pull request with gh: convention-following commits, a body with summary visuals, evidence and merge danger, opened as a draft after approval. | `github-meta` |
| [`gh-release`](plugins/gh-release) | skill | Cut a manual GitHub release with gh: detect release tooling first, propose a SemVer bump from the public-API diff, draft a Keep a Changelog entry, open a release PR, then tag and publish after approval. | - |
| [`gh-repo-setup`](plugins/gh-repo-setup) | skill | Audit and set up a GitHub repository's surface with gh: labels, issue forms, PR template, CODEOWNERS, SECURITY.md, CONTRIBUTING.md, and branch or tag rulesets, with a dry-run plan. | - |
| [`gh-triage`](plugins/gh-triage) | skill | Triage existing GitHub issues and external PRs with gh: category and state labels, duplicate and prior-rejection checks, claim verification, needs-info notes, agent briefs and stale policy. | - |
| [`git-commit`](plugins/git-commit) | skill | Writes and creates Git commits in the repository's own message convention (Conventional Commits, release-please, commitlint) and names new branches to match it. | `baseline` |
| [`git-history`](plugins/git-history) | skill | Edits and repairs Git history safely without opening an editor: fixup and autosquash, rebasing onto the default branch or a new base, splitting commits, cherry-pick backports, bisect, and reflog recovery. | - |
| [`git-statusline`](plugins/git-statusline/README.md) | hook | A mod that draws a git line under the prompt: repo path, branch, linked-worktree marker, ahead/behind with colour past unpushed-commit thresholds, staged/modified/new/conflict counts, changed lines and stash count. | `baseline` |
| [`gitops`](plugins/gitops) | skill | Sets up and reviews GitOps delivery with Argo CD or Flux: choosing between them, repo layout, sync policy per environment, and secrets with External Secrets, Sealed Secrets or SOPS. | `kubernetes-meta` |
| [`golang`](plugins/golang) | skill | Go language skill: packages, errors, interfaces, context, goroutines and shutdown, modules, tests, with references for pitfalls, security, database/sql, gRPC, linting and modernizing. | `golang-meta` |
| [`golang-cli`](plugins/golang-cli) | skill | Go command-line tools with cobra and viper: command tree and hooks, flag, env and config precedence, output and exit codes, signal shutdown, testable commands. | - |
| [`golang-performance`](plugins/golang-performance) | skill | Measurement-first Go performance: benchstat comparisons, pprof and trace reading, escape analysis, GC and GOMEMLIMIT tuning, and CI regression checks. | - |
| [`handoff`](plugins/handoff) | skill | Compacts the current conversation into a handoff document a fresh session can pick up, and with --bg launches that session as a background agent. Manual command. | `baseline` |
| [`helm`](plugins/helm) | skill | Authors, validates and releases Helm charts: values and schema, helpers, dependencies, lint and template checks, helm diff, atomic upgrades, OCI publishing and provenance. | `kubernetes-meta` |
| [`implement-plan`](plugins/implement-plan) | skill | Executes an approved multi-slice implementation plan file end to end, running independent slices in parallel worktrees and checking, reviewing, committing, and updating a Status block after each slice without asking. Use when the user says "implement this plan", "continue implementing", or points at a plan file to carry out. | - |
| [`issue-breakdown`](plugins/issue-breakdown) | skill | Turn a spec, plan or conversation into a reviewed set of linked GitHub issues cut as vertical slices with blocking edges, writing a spec first when needed, and publish them with gh after a dry run and approval. | - |
| [`javascript`](plugins/javascript) | skill | Covers JavaScript runtime semantics, meaning ESM vs CommonJS, import side effects, promises and the event loop, async cleanup and cancellation, browser vs Node/Bun/Deno/edge, measured performance and JS tests. Use when writing, reviewing or debugging *.js/*.mjs/*.cjs or runtime behavior of JS/TS code (import errors, unhandled rejections, leaks, ordering bugs). | `node-typescript-meta` |
| [`kubernetes`](plugins/kubernetes) | skill | Writes and reviews Kubernetes manifests (probes, resources, RBAC, NetworkPolicy, Pod Security Standards and admission, Jobs, HPA, PDB, Kustomize) and triages failing workloads with read-only kubectl. | `kubernetes-meta` |
| [`mcp-health`](plugins/mcp-health/README.md) | hook | A mod that shows `mcp: <server> ✗` under the prompt while an MCP server's latest tool call errored, hidden while all are fine, with an optional toast on each server's first error. | `baseline` |
| [`orchestration`](plugins/orchestration/README.md) | agent + hook | Main-session orchestrator agent: plans work, routes it to the installed agents and verifies the results. Ships the claude-orchestrate launcher (linked into ~/.local/bin at session start), which appends the core Claude Code system prompt that --agent would otherwise replace and can start Claude inside herdr. | `orchestration-meta` |
| [`planning`](plugins/planning) | skill | Writes, reviews, or revises implementation plans whose scope, verification, and reruns are proportionate to risk. Use for "plan this", "review this plan", "cheapest way to verify", work spanning several slices or risky boundaries, acceptance criteria for an ambiguous change, multi-agent or multi-session plans, and "grill me" stress-tests. | `programming-core` |
| [`playwright-cli`](plugins/playwright-cli) | skill | Drive a headless, isolated browser from Bash with playwright-cli: inspect pages, fill forms, take screenshots, debug console and network errors, and run smoke QA. | `web-meta` |
| [`pr-comments`](plugins/pr-comments) | skill | Manual /pr-comments: pull a PR's unresolved review threads and review summaries into context, triage them, and fix the ones you pick. Read-only on GitHub. | `github-meta` |
| [`prisma`](plugins/prisma) | skill | Prisma ORM 6 and 7 traps for TypeScript backends, such as updateMany returning a count, interactive transaction timeouts, migrate dev resets, edited applied migrations, undefined filters, P2002/P2025/P2003 handling, serverless connections and driver adapters. Use when writing a Prisma schema, query, transaction or migration, or debugging one. | - |
| [`problem-solving`](plugins/problem-solving) | skill | Root-cause diagnosis for failures, flaky tests and performance regressions: a red-capable feedback loop, competing falsifiable hypotheses, one-variable probes and evidence-backed fixes. Also algorithm choice under unclear constraints. | `programming-core` |
| [`production-readiness`](plugins/production-readiness) | skill | Evidence-based ship-or-block review (Blocked, Risky or Caveats) of an application before launch, built from local repo evidence. | - |
| [`python`](plugins/python) | skill | Python idiom, review and diagnosis: typing, exceptions, resource lifetimes, asyncio, retries and background jobs, profiling and pytest. | `python-meta` |
| [`python-packaging`](plugins/python-packaging) | skill | Build and validate Python distributions and uv workflows: pyproject.toml, package data, entry points, wheel and sdist checks, uv in CI and Docker, and PyPI trusted publishing. | `python-meta` |
| [`react`](plugins/react) | skill | Changes, reviews and debugs React components: state ownership, effects, keys, render purity, Server Components and Actions, accessibility, measured performance, React 19 upgrades and component tests. Use for .tsx/.jsx behavior or render cost, such as "this list lags when I type", "it re-renders too much", effect loops or hydration mismatches. | `web-meta` |
| [`readonly-agent-gate`](plugins/readonly-agent-gate) | hook | PreToolUse hook that limits the read-only agents (architect, reviewer, debugger, security-auditor, open-source-release-audit, plus any you list) to Bash commands that don't write outside /tmp and the session scratchpad. Needs bun. | `orchestration-meta` |
| [`recommend-plugins`](plugins/recommend-plugins) | skill | Inspects the current project, proposes the adminhead meta plugins, bundles and focused plugins that fit it from the live catalog, and installs the ones you confirm at local or project scope. Manual command. | `baseline` |
| [`reviewer`](plugins/reviewer) | agent | A read-only review subagent for implementation plans, designs and diffs, checked against the brief and its acceptance criteria, returning verified findings ranked by severity. The caller picks quick or thorough depth. | `orchestration-meta` |
| [`rollout-plan`](plugins/rollout-plan) | skill | Plans and verifies production rollouts: strategy choice, preflight go/no-go, phased verification signals, numeric rollback criteria and post-deploy follow-up. | - |
| [`rust`](plugins/rust) | skill | Rust language skill: ownership and lifetimes, error design, traits and modules, Cargo features, async and concurrency, unsafe review, clippy and measured performance. | `rust-meta` |
| [`screen-reader-testing`](plugins/screen-reader-testing) | skill | Plan, run with the user and report manual screen-reader and keyboard tests of a built web journey (NVDA, JAWS, VoiceOver, Orca, TalkBack). | `design-core` |
| [`scribe`](plugins/scribe) | agent | A documentation subagent that writes and updates READMEs, guides, docstrings, changelogs and Outline wiki documents, checking every claim against the code and marking anything it could not verify. | `orchestration-meta` |
| [`ship`](plugins/ship) | skill | Ship finished work in one run: commit, push, and optionally open a PR, watch checks and merge, delegated to the shipper agent. | `github-meta` |
| [`shipper`](plugins/shipper) | agent | Agent that commits finished work, pushes it, and optionally opens a PR, watches checks and merges, on a cheap model. Used by the ship skill. | `github-meta` |
| [`tanstack`](plugins/tanstack) | skill | Works with TanStack Query, Router, Form, Table, Virtual and Start: state ownership, query keys, cache invalidation, loaders, search-param validation, server-driven tables, virtualization and SSR boundaries. Use when code imports @tanstack/*, or for stale or duplicate data, lost form values, table and pagination mismatches, or Start server functions. | - |
| [`terraform`](plugins/terraform) | skill | Terraform, OpenTofu and Terragrunt skill: safe plan and saved-plan apply, plan review, state and refactoring blocks, Terratest, and security scanning with Trivy, Checkov and OPA. | `iac-meta` |
| [`test-gap-audit`](plugins/test-gap-audit) | skill | Read-only audit of missing, weak and stale tests for a repo, PR or feature: maps source to tests with a bundled script and ranks gaps P0-P3 by behavior and risk, never by coverage percentage. | - |
| [`test-run`](plugins/test-run) | skill | Manual test-run command: detects the test runner, runs the tests affected by your changes, prints only compact failures, and fixes them in a bounded loop. | `programming-core` |
| [`ts-module-boundaries`](plugins/ts-module-boundaries) | skill | Sets up dependency-cruiser in a TypeScript repo so each package is reachable only through its root entry-point files, with no deep imports and no cycles, then proves the rules fail on a violation. Use when the user asks to enforce package boundaries, stop deep imports or add dependency-cruiser. | - |
| [`typescript`](plugins/typescript) | skill | Handles TypeScript type-level and compiler work, covering tsconfig strictness, narrowing, generics, discriminated unions, declarations and module resolution, public type APIs, runtime validation of unknown data, and type tests. Use when editing *.ts/*.tsx types or tsconfig.json, or fixing tsc errors. | `node-typescript-meta` |
| [`ui-critic`](plugins/ui-critic) | agent | Renders a built web page or local HTML file headless at 1440/768/390 px, runs lint and inspect checks, critiques the screenshots and returns at most three ranked fixes with FAIL/WARN counts. Use after building or restyling a page, or when asked why a page looks generic. Not for mockups, e2e tests or WCAG audits. | `design-core` |
| [`ui-direction`](plugins/ui-direction) | skill | Art direction and build process for new UI or a visual reshape, such as a landing page, marketing site, portfolio, product page or a new app screen with no design system. Grounds the design in the subject, deals a researched direction, plans tokens and checks the render. Use when a page should look designed, or looks generic, templated or AI-made. | `design-core` |
| [`uiux-lookup`](plugins/uiux-lookup) | skill | Offline lookup of cited UI/UX rules (WCAG 2.2, touch, forms, navigation), 22 stack UI guideline sets including SwiftUI, Compose, Flutter, React Native, WPF, WinUI and Avalonia, Google Fonts metadata and licences, and curated icons. | `design-meta` |
| [`unit-testing`](plugins/unit-testing) | skill | Focused unit and regression tests for changed behavior or a confirmed bug, in any language: smallest proving test, test-first slices, seams and boundary-only mocks, plus pytest and Vitest/Jest references. No coverage quotas. | `programming-core` |
| [`usage-band`](plugins/usage-band/README.md) | hook | A band above the prompt with context fill by category and rate-limit windows coloured by pace, a toast when a window turns amber or red or resets, plus session cost, cache hit rate, compactions and effort. | `baseline` |
| [`ux-copy`](plugins/ux-copy) | skill | Writes and reviews product microcopy: button and CTA labels, error messages, empty states, confirmation dialogs, tooltips, loading and onboarding text. Use for "what should this button say?", "write copy for", "review this error message" or wording a dialog. Not for marketing page copy or long-form docs. | `design-core` |
| [`vite`](plugins/vite) | skill | Configures and debugs Vite 7 and 8 (Rolldown/Oxc): env variables and client-bundle exposure, dev vs build vs preview, chunking, library mode, SSR externals, pre-bundling, proxy and container access. Use when editing vite.config.*, when a build differs from dev, an env value is missing or leaked, chunks go stale after a deploy, or the dev server is slow. | `web-meta` |
| [`vue`](plugins/vue) | skill | Builds and debugs Vue 3 components with the Composition API, Pinia stores and Nuxt 4 data fetching: props, emits, defineModel, composables, reactivity, watchers, SSR safety and tests. Use when adding, changing or debugging .vue files, Pinia stores or a Nuxt app, such as lost reactivity, stale state, hydration mismatches or duplicate fetches. | - |
| [`web-design`](plugins/web-design) | skill | Extend an existing product's visual system: hierarchy, responsive, state and accessibility intent, DESIGN.md, and review of the rendered UI against it. | `design-core` |
| [`web-development`](plugins/web-development) | skill | Builds or repairs a browser-facing web feature end to end: semantic HTML and forms, responsive CSS, keyboard and focus, request and response contracts, server validation, error mapping and measured performance, verified in a real browser. Use for a form, page or flow that must work for real users, an HTTP API contract change, or a browser or network bug. | `web-meta` |
| [`web-perf-auditor`](plugins/web-perf-auditor) | agent | Agent that audits a web app's performance: a static source scan marked not measured, or a deep audit from Lighthouse, PageSpeed or CrUX data, with no fabricated numbers. | `web-meta` |
| [`adr-writing`](plugins/adr-writing) | skill | ADR skill: create, review, supersede and index Markdown Architecture Decision Records in docs/adr/ (Nygard or MADR) with a numbering helper that avoids cross-branch collisions. | - |
| [`agent-config-audit`](plugins/agent-config-audit) | skill | Read-only security review of your own Claude Code configuration: CLAUDE.md, settings permissions, hooks, subagents and .mcp.json, including static classification of unpinned npx, uvx, pipx and docker MCP selectors. | - |
| [`agent-instructions`](plugins/agent-instructions) | skill | Builds and maintains a repo's CLAUDE.md, .claude/rules and AGENTS.md from verified evidence, and turns repeated agent mistakes into checks, hooks and failure notes. | - |
| [`agent-status`](plugins/agent-status/README.md) | hook | A mod that adds a live-agent count by status and task done/total above the prompt, with an `agents` pane giving each agent's model, time in status and time since spawn, which the built-in agent panel lacks. | - |
| [`api-graphql`](plugins/api-graphql) | skill | Public GraphQL API design and review: when GraphQL fits, schema conventions, Relay pagination, result-union errors, query ceilings, federation boundary, persisted queries and field deprecation. | - |
| [`api-grpc`](plugins/api-grpc) | skill | gRPC and protobuf contract design and review: AIP conventions, buf lint and breaking gates, proto diff compatibility, streaming, google.rpc.Status errors and gateway mapping. | - |
| [`api-idempotency`](plugins/api-idempotency) | skill | Idempotency keys and safe retries for HTTP APIs: per-account client keys, atomic claim, in-flight and replay states with recovery jobs, and client retry policy with full-jitter backoff, retry budgets and deadlines. | - |
| [`api-keys`](plugins/api-keys) | skill | API keys a platform issues to its consumers: prefixed checksummed key format, hash-only storage and lookup, scopes, dual-key rotation with last-used telemetry, service-account ownership and offboarding, keys versus OAuth. | - |
| [`api-oauth-provider`](plugins/api-oauth-provider) | skill | OAuth 2.1 authorization-server design and review: grants and PKCE, redirect matching, token lifetimes, refresh rotation with reuse detection, scopes, consent, client registration and MCP auth. | - |
| [`api-rest-design`](plugins/api-rest-design) | skill | REST/HTTP API contract design and review skill: resources and methods, status codes, RFC 9457 errors, pagination, rate-limit headers, contract-first OpenAPI with drift checks, and versioning and deprecation policy. | - |
| [`api-webhooks`](plugins/api-webhooks) | skill | Provider-side outbound webhooks skill: event catalog and payloads, Standard Webhooks signing and rotation, at-least-once delivery with backoff and dead-lettering, SSRF defenses, and the delivery log and replay surface. | - |
| [`app-auth`](plugins/app-auth) | skill | Application-side authentication and authorization: sessions, password and recovery flows, OAuth/OIDC callbacks, JWT validation, tenant and ownership checks, cookies, CSRF and rate limits. | - |
| [`aws-cloudwatch`](plugins/aws-cloudwatch) | skill | AWS incident investigation from CloudWatch alarms, metrics, Logs Insights and CloudTrail: blast radius, change correlation, timeline and per-resource health, with mutating fixes only after approval. | `aws-meta` |
| [`aws-resource-query`](plugins/aws-resource-query) | skill | Read-only AWS CLI resource inspection: what exists in an account or region and how it is configured, with a deny-list for secret and data reads, --query projections, and changes only on request. | `aws-meta` |
| [`aws-well-architected`](plugins/aws-well-architected) | skill | AWS Well-Architected and cost review of a workload from its IaC and read-only live calls: per-pillar findings rated High, Medium or Low, plus right-sizing candidates backed by CloudWatch and Cost Explorer. | `aws-meta` |
| [`better-auth`](plugins/better-auth) | skill | Better Auth library setup and debugging from version-matched docs: adapters, the auth CLI, route handlers, sessions, security options, email/password, two-factor and organizations. | - |
| [`cache-clock`](plugins/cache-clock/README.md) | hook | A mod that shows when the prompt cache likely expires (`cache warm → ~14:32`) under the prompt, turning to a cold warning past a configured TTL. Approximate: last main-loop turn plus the TTL. | - |
| [`chezmoi`](plugins/chezmoi) | skill | chezmoi dotfiles skill: source-state attributes, templates and machine data, age and password-manager secrets, externals and run_ scripts, behind a preview-first apply gate. | - |
| [`codebase-design`](plugins/codebase-design) | skill | Deep-module design skill: module, interface, seam and adapter vocabulary, deepening by dependency category, design-it-twice, and a user-invoked architecture review that finds deepening candidates with codebase-memory. | - |
| [`config-audit`](plugins/config-audit) | skill | Audits an installed Claude Code setup for bloat and rot, measures each item's context cost, and proposes keep, improve, retire or merge verdicts with soft-delete cleanup approved one item at a time. | - |
| [`consult`](plugins/consult/README.md) | hook | A mod that registers the mcp__consult__consult tool: a read-only diff or plan review by the codex (OpenAI) or agy (Google Gemini) CLI, with a repo opt-out marker, a secret-file block, timeouts and a read-only agy hook gate. | - |
| [`db-schema-design`](plugins/db-schema-design) | skill | Portable relational schema design and review: keys, constraints and FK delete actions, normalization, access paths, expand-contract migrations with backfills, and shared-database safety rules. | - |
| [`dba`](plugins/dba) | agent | A database subagent: designs and reviews schemas and migrations, writes migration, schema and query changes in the repo when asked, and diagnoses slow queries with EXPLAIN. Never writes to shared databases. | - |
| [`deprecation-migration`](plugins/deprecation-migration) | skill | Deprecation and migration skill: Hyrum's law, a sunset-or-keep decision tree, incremental consumer migration (strangler, adapter, flags), and expand/contract for zero-downtime schema changes. | - |
| [`devcontainer`](plugins/devcontainer) | skill | Dev container skill: review and write devcontainer.json, Dev Container Features and Codespaces config against sourced spec rules, plus Codespaces startup and cost tuning. | - |
| [`devenv`](plugins/devenv) | skill | devenv.sh skill: configure, migrate, debug and verify developer environments in devenv.nix and devenv.yaml, with option shapes checked against the installed version and secrets kept out of Nix evaluation. | - |
| [`docs-audit`](plugins/docs-audit) | skill | Docs audit skill: compare README, setup, API, config and CLI docs against the code, rank drift P0 to P3 with cited evidence, check commands, links and env vars with a script, and fix on request. | - |
| [`domain-modeling`](plugins/domain-modeling) | skill | Domain modeling skill: challenge and sharpen project terms in conversation and keep GLOSSARY.md (and GLOSSARY-MAP.md for multi-context repos) current as terms settle. | - |
| [`doubt-review`](plugins/doubt-review) | skill | Fresh-context adversarial review of non-trivial in-flight decisions: state the claim, hand the artifact and contract to a subagent told to disprove it, reconcile findings, stop after three cycles. | - |
| [`esp-idf`](plugins/esp-idf) | skill | ESP-IDF firmware skill for ESP32-family chips: write, review, debug and bring-up, with build/flash/monitor wrappers, templates, and confirmation gates before flashing, eFuse burns or partition changes. | - |
| [`experiment-loop`](plugins/experiment-loop) | skill | Runs a bounded, unattended optimize-and-measure loop on a dedicated git branch, one hypothesis per commit, with a fixed metric command, keep-or-revert decisions and a results log. Use when the user wants many experiments against a measurable goal such as benchmark time, bundle size, memory or test pass rate. | - |
| [`file-conversion`](plugins/file-conversion) | skill | Local-only file conversion skill: image, audio, video, document and CSV/JSON conversions with ffmpeg, ImageMagick, pandoc, LibreOffice and the Python stdlib, inspecting inputs first, preserving originals and verifying outputs. | - |
| [`grafana-dashboards`](plugins/grafana-dashboards) | skill | Grafana dashboards skill: dashboards built from operator questions with RED and USE panel sets, a quality checklist, current panel types and JSON models, and dashboards as code via provisioning, Terraform or the Foundation SDK. | - |
| [`grep-app`](plugins/grep-app/README.md) | mcp | grep.app MCP server (remote HTTP, no API key): literal and regex code search across about a million public GitHub repositories. | `programming-core` |
| [`homelab-network`](plugins/homelab-network) | skill | Home and homelab network planning, read-only first: inventory, VLANs and trust zones, default-deny firewall rules, Pi-hole DNS cutover, WireGuard remote access and interface error diagnosis. | - |
| [`mcp-server`](plugins/mcp-server) | skill | MCP server skill: design the tool surface (workflow tools, descriptions, write-tool safeguards, auth) and build it with the official TypeScript, Python, Go or Rust SDK over stdio or Streamable HTTP, tested with the Inspector. | - |
| [`mcp-server-audit`](plugins/mcp-server-audit) | skill | MCP server audit skill: checks configured or third-party MCP servers for tool poisoning, shadowing, rug pulls, SSRF and unauthenticated exposure, with offline description scanning and hash pinning. | - |
| [`mcp-server-review`](plugins/mcp-server-review) | skill | MCP server review skill: static security review of server or client source and a release QA pass over one real local protocol session, with OWASP MCP Top 10 checks. | - |
| [`modernize`](plugins/modernize) | skill | Plans the modernization of a legacy system (runtime, framework or dependency upgrade, migration or rewrite) with a feasibility spike, testability milestone, safety ladder, hazard red-team and phased exit criteria. Use for "modernize this", "plan the migration", "how do we get off this stack", or a major version upgrade plan. | - |
| [`mysql`](plugins/mysql) | skill | MySQL and MariaDB skill: EXPLAIN risk signals, composite indexes, upsert syntax differences, keyset pagination, InnoDB deadlocks, SKIP LOCKED queues, online DDL, replica lag, pools and grants. | - |
| [`observability-instrumentation`](plugins/observability-instrumentation) | skill | Observability instrumentation skill: structured logs with correlation IDs, metrics with bounded labels, OpenTelemetry traces, profiling, symptom alerts, and SLOs with burn-rate alerts, starting from the questions on-call will ask. | - |
| [`open-source-release-audit`](plugins/open-source-release-audit) | agent | A read-only subagent that audits a repo before it goes public: secrets (gitleaks or trufflehog, regex fallback), PII, internal references, dangerous files, .env.example gaps, git history and unreadable binaries, returning PASS, PASS WITH WARNINGS or FAIL. | - |
| [`pass-cli`](plugins/pass-cli) | skill | Proton Pass CLI skill: find vaults and items by ID, build pass:// references, and inject secrets into a process or file without ever printing them. | - |
| [`plugin-vetter`](plugins/plugin-vetter) | agent | A read-only subagent that statically vets a third-party plugin, skill, agent, hooks.json or .mcp.json before install for hidden directives, invisible unicode, encoded payloads, tool shadowing and scope mismatch, with a PASS, FAIL or NEEDS HUMAN REVIEW verdict. | - |
| [`poka-yoke`](plugins/poka-yoke) | skill | Poka-yoke skill: design or audit code so mistakes cannot be expressed, ranking hazards on a control, warning, detection and docs-only ladder, and sweeping for the hazard class after an incident. | - |
| [`postgres`](plugins/postgres) | skill | PostgreSQL skill: EXPLAIN reading and pg_stat_statements, index choice, statistics, locks, vacuum, isolation retries, online DDL, partitioning, RLS cost, Postgres types and table-design gotchas, and pgvector. | - |
| [`postmortem`](plugins/postmortem) | skill | Blameless postmortem skill: gap-flagged UTC timeline, 5 Whys to a fixable system gap, impact and detection gaps, owned and dated actions, plus a quick template for minor incidents and runbook rules. | - |
| [`pre-commit`](plugins/pre-commit) | skill | Commit-time hooks with prek or pre-commit (and Husky for Node): pinned config, installs, all-files runs, rev updates, CI parity, and repairing a failing hook without bypassing it. | - |
| [`privacy-review`](plugins/privacy-review) | skill | Privacy and data-handling review: inventories personal data, traces where it flows and rests, and checks minimization, retention, erasure, export, and PII in URLs and logs. | - |
| [`promql`](plugins/promql) | skill | PromQL and Prometheus skill: correct counter and histogram queries, query cost limits, RED and USE investigations, data gaps, scrape and rule config, Alertmanager routing, and promtool checks, with credentials kept out of commands. | - |
| [`prototype`](plugins/prototype) | skill | Builds a throwaway prototype that answers one design question, either a single-file HTML demo that drives a state model through hard cases or several structurally different UI variants on one route. Use to sanity-check a state model, data shape or API feel, or to compare layouts before committing. | - |
| [`redis`](plugins/redis) | skill | Redis and Valkey skill: data structures, caching patterns, TTL and key design, eviction policy, stampede control, rate limits, token-checked locks, Streams vs Pub/Sub, and connection handling. | - |
| [`research`](plugins/research) | skill | Answers an external, decision-relevant question with sourced, cited evidence at quick, standard or deep depth. Use for "compare X vs Y", "is it true that...", "what's the current state of...", choosing a library or tool, or explaining a topic from authoritative sources. | - |
| [`review-loop`](plugins/review-loop) | skill | Review, fix and re-review loop: built-in /code-review finds issues, a fixer subagent fixes the flagged IDs, and a fresh re-reviewer checks only those IDs from a shared findings file, for up to three rounds. | - |
| [`second-opinion`](plugins/second-opinion) | skill | Second-opinion skill: pick codex or agy, model, effort and pass size for a read-only outside review of a diff or plan through the consult tool, weigh the replies, or run a local two-reviewer gate. | - |
| [`security-auditor`](plugins/security-auditor) | agent | A read-only security review subagent for diffs and code areas: taint tracing, auth, injection, secrets, supply chain, CI and IaC trust, returning severity-ranked findings with attack paths. | - |
| [`security-scan`](plugins/security-scan) | skill | Manual security audit of a branch: gitleaks, semgrep, trivy, govulncheck and pip-audit in one script, subagent verification, a ranked findings table, plus CI and supply-chain trust checks and SBOM guidance. | - |
| [`sentry-mcp-self-hosted`](plugins/sentry-mcp-self-hosted/README.md) | mcp | Sentry's MCP server (@sentry/mcp-server 0.42.0, pinned) over stdio for self-hosted Sentry, read-only by default. Off until enabled; prompts for the host and a user auth token kept in secure storage. | - |
| [`sentry-sdk`](plugins/sentry-sdk) | skill | Sentry SDK skill: init, errors, tracing, structured logs, metrics and crons across platforms, driven by the project's ## Sentry profile, with current-docs lookups and notes for self-hosted Sentry. | - |
| [`session-retro`](plugins/session-retro) | skill | Runs a retrospective on a Claude Code session and proposes fixes to the agent's environment (checks, hooks, navigation pointers, steering files, tool economy) ranked by severity. Use when the user asks for a retro, a post-session review, or why a session went badly. | - |
| [`setup-wizard`](plugins/setup-wizard) | skill | Manual skill that generates a bash wizard for human-only setup steps: opens each dashboard, captures secrets with hidden input, writes a gitignored .env and sets GitHub secrets. | - |
| [`termwright`](plugins/termwright) | skill | Drive and test terminal UI apps with the termwright CLI: YAML step files that assert state transitions, one-shot screen and PNG capture, and daemon sessions, with safety rules for real input. | - |
| [`the-fool`](plugins/the-fool) | skill | Devil's advocate skill that steelmans an idea or decision, then challenges it in one chosen mode (Socratic, dialectic, pre-mortem, red team, evidence audit) and drives to a stronger position. | - |
| [`threat-model`](plugins/threat-model) | skill | STRIDE threat modeling from the code: trust boundaries, data-flow diagram, verified findings tiered by exploitability, attack trees, testable security requirements and mapped controls. | - |
| [`turn-stats`](plugins/turn-stats/README.md) | hook | A mod that shows a toast after long main-loop turns with the duration, output tokens and cache hit rate (`turn 3m12s · 41k out · cache 92%`). | - |
| [`docs-sync`](plugins/docs-sync) | hook | Hook that, once per change set at Stop, nudges Claude with docs that mention a file this session edited or a name its edits removed. Skips plans, research, ADRs and changelogs; fails open. Needs git and bun. | - |
| [`aspire`](plugins/aspire) | skill | Aspire skill: AppHost resource model and wiring, service defaults, the aspire CLI (start, wait, describe, logs), DistributedApplicationTestingBuilder tests, and aspire publish/deploy to Compose, Kubernetes and Azure. | - |
| [`aspnet-core`](plugins/aspnet-core) | skill | Builds and reviews ASP.NET Core HTTP apps: minimal APIs and controllers, DTOs, validation, ProblemDetails, OpenAPI, middleware order, auth wiring, .http files, CRUD endpoints written without scaffolders. Use for Program.cs endpoint or middleware work, "add an endpoint", OpenAPI setup, or global error handling in a .NET web project. | - |
| [`blazor`](plugins/blazor) | skill | Blazor skill: component rules, render modes, forms and validation, auth per render mode, shared state, data loading, prerendering, JS interop, and Blazor Server to Web App conversion. | - |
| [`csharp`](plugins/csharp) | skill | Writes, reviews, refactors and debugs C# and .NET code (types, nullable references, async and cancellation, exceptions, DI, options and logging in the generic host, file-based apps). Use for work in *.cs or *.csx files, "review this C# class", CS86xx nullable warnings, a deadlock or sync-over-async bug, or a rename across a solution. | `dotnet-meta` |
| [`dotnet-ai-apps`](plugins/dotnet-ai-apps) | skill | Chooses and wires AI and ML in .NET apps with Microsoft.Extensions.AI (IChatClient, embeddings), Microsoft Agent Framework, vector search and RAG, ML.NET, ONNX Runtime and OllamaSharp. Use for adding an LLM call or chatbot to a .NET service, a tool-calling agent in C#, RAG over documents, or choosing between an LLM and ML.NET for a prediction. | - |
| [`dotnet-diagnostics`](plugins/dotnet-diagnostics) | skill | Collects runtime evidence from running or crashed .NET processes: dotnet-counters, dotnet-trace, dotnet-dump, dotnet-monitor, PerfView, perfcollect, crash dumps in containers and Kubernetes, mobile crash symbolication. Use for high CPU, memory growth, hangs or crashes in production, capturing a dump, or choosing a tool for Linux in k8s. | - |
| [`dotnet-native-interop`](plugins/dotnet-native-interop) | skill | Writes, reviews and debugs .NET native interop with P/Invoke and LibraryImport, covering signatures from C headers, string and struct marshalling, memory ownership, SafeHandle, callbacks and library loading. Use for wrapping a C library, a DllNotFoundException or AccessViolationException at a native call, or moving DllImport to LibraryImport for AOT. | - |
| [`dotnet-performance`](plugins/dotnet-performance) | skill | Measurement-first .NET performance work: hot-path anti-pattern scans (async, allocations, strings, LINQ, regex, JSON, I/O), BenchmarkDotNet setup and result reading, and SIMD with TensorPrimitives or Vector128. Use when C# code is slow or allocates too much, to review a hot path, write or compare benchmarks, or vectorize a loop. | - |
| [`dotnet-template-authoring`](plugins/dotnet-template-authoring) | skill | Authors, validates and packages custom `dotnet new` templates, covering template.json from an existing project, symbols and conditional content, post-actions, constraints and template packs. Use for "turn this project into a template", a template missing from `dotnet new list` after install, or reviewing a template.json before publishing. | - |
| [`dotnet-testing`](plugins/dotnet-testing) | skill | Writes, runs and fixes .NET tests in xUnit, NUnit, MSTest and TUnit: dotnet test syntax for VSTest vs Microsoft.Testing.Platform, filters, TRX and dumps, test-project wiring, TimeProvider and file-system seams, coverage. Use for running tests in a .NET repo, a filter that matches nothing, "VSTest or MTP?", or testing DateTime.Now code. | `dotnet-meta` |
| [`dotnet-upgrade-guide`](plugins/dotnet-upgrade-guide) | skill | Upgrades .NET projects - TFM hops from .NET 8 to 11 with breaking changes by area, legacy csproj to SDK-style, packages.config to PackageReference, AOT and trim warnings, Thread.Abort removal, test framework moves. Use for "upgrade to .NET 10", SDK-style conversion, IL2026/IL3050 warnings, or moving to xUnit v3, MSTest v4 or MTP. | - |
| [`ef-core`](plugins/ef-core) | skill | Writes, reviews and tunes EF Core data access: query shape, tracking, Include vs split queries, N+1, bulk ExecuteUpdate/Delete, DbContext lifetime, migrations, raw SQL parameters, and Dapper code beside it. Use for DbContext or LINQ-to-entities code, a slow EF query, dotnet ef migrations, or reviewing a repository or import job. | - |
| [`game-ai`](plugins/game-ai) | skill | Engine-agnostic game AI skill: NPC and enemy decisions with FSMs, behavior trees and utility AI, steering and flocking, A*, flow fields and navmeshes in concept, perception and difficulty knobs. | - |
| [`game-architecture`](plugins/game-architecture) | skill | Engine-agnostic game code structure: game loop and fixed timestep, state machines (flat, hierarchical, parallel), composition, event bus, object pools, data-driven content, inventory and ability systems, scene flow and save systems. | `gamedev-core` |
| [`game-assets`](plugins/game-assets) | skill | Art direction and asset pipeline for game art, mainly 2D: a style bible, palette and scale rules, sprite, animation, tileset, UI and icon specs, an asset manifest with naming and licenses, image-generation briefs, and import checks. Use for a game's art style, sprites, tilesets, an asset list or sourcing art. | - |
| [`game-audio`](plugins/game-audio) | skill | Engine-neutral game audio practice: bus and mixer layout, gain in dB, ducking, adaptive music with layers and quantised transitions, SFX variation and voice limits, beat sync, and platform loudness targets. | `gamedev-core` |
| [`game-design`](plugins/game-design) | skill | Game design documents and decisions: pitch, pillars, core loop, mechanic specs, progression, economy and balancing (curves, sinks and faucets, loot tables, simulation), difficulty and scope cuts. Engine-neutral templates and checklists. | `gamedev-core` |
| [`game-feel`](plugins/game-feel) | skill | Engine-agnostic game feel: input buffering, coyote time, variable jump, deadzones, rebinding, camera follow, look-ahead and shake, hit-stop, tweens, squash and stretch, knockback and render jitter. | `gamedev-core` |
| [`game-genres`](plugins/game-genres) | skill | Engine-agnostic genre playbooks: core systems, data model, feel targets, balancing norms and pitfalls for platformers, roguelikes, card games, puzzles, RPGs, FPS, tower defense, survival-crafting and visual novels, plus branching dialogue (Ink, Yarn Spinner, custom runners). | - |
| [`game-performance`](plugins/game-performance) | skill | Engine-agnostic game performance, measured first: frame budgets, profiling a release build on target hardware, CPU versus GPU triage, draw calls and batching, overdraw, allocation and GC hitches, pooling, asset budgets and regression checks. | `gamedev-core` |
| [`game-playtest`](plugins/game-playtest) | skill | Game playtests: research questions, test type, recruiting and consent, session scripts and observer sheets, think-aloud, surveys, lightweight telemetry, ranked change lists, and keep-or-kill criteria for a build. | `gamedev-core` |
| [`game-prototype`](plugins/game-prototype) | skill | Timeboxed game prototyping: a greybox mechanic spike or vertical slice that answers one question with keep or kill criteria, and game-jam planning (scope to the clock, hour schedule, cut list, submit early). Use when prototyping a mechanic, greyboxing, or planning a jam or 48-hour build. | - |
| [`game-publish`](plugins/game-publish) | skill | Ships a game build to a store and plans the release: itch.io uploads with butler channels and versions, Steam with SteamPipe depots, app_build.vdf, steamcmd and branches, and Steam release timing (app fee wait, Coming Soon, reviews, Next Fest, discounts). Use for butler push, steamcmd or a Steam launch date. | - |
| [`game-ui`](plugins/game-ui) | skill | Engine-neutral game UI and UX: HUDs, menus and overlays, a screen stack, resolution and aspect scaling, safe areas, gamepad focus navigation, event-driven HUDs, settings screens, and a game accessibility checklist. | `gamedev-core` |
| [`godot`](plugins/godot) | skill | Godot 4 entry point: GDScript, nodes and scenes, signals, custom Resources, autoloads, project.godot and safe .tscn/.tres edits (uid:// and .uid files), with references for 2D, 3D, UI, input, audio, animation, saves, performance and debugging, and routing to the other godot plugins and the editor MCP. | `godot-meta` |
| [`godot-addons`](plugins/godot-addons) | skill | Godot addon APIs for Beehave and LimboAI behavior trees, Phantom Camera and Dialogue Manager v4. Use when a project has addons/beehave, addons/limboai, addons/phantom_camera or addons/dialogue_manager, or when choosing, installing or writing code and .dialogue files for one of them. | - |
| [`godot-csharp`](plugins/godot-csharp) | skill | Writes and fixes C# in Godot 4 .NET projects: partial node classes, the PascalCase lifecycle, [Export], [Signal] events, GDScript interop, the .csproj and the build. Use for .cs or .csproj files beside project.godot, "port this GDScript to C#", GD0201 errors, or ObjectDisposedException after a signal. | - |
| [`godot-editor-tools`](plugins/godot-editor-tools) | skill | Godot 4 editor plugins and addons. Use when writing or fixing an EditorPlugin, plugin.cfg, @tool script, inspector plugin, EditorDock, 3D gizmo, tool menu, undoable scene edits or an addon that runs a server inside the editor, or when a project has addons/*/plugin.cfg. | - |
| [`godot-export`](plugins/godot-export) | skill | Godot 4 export skill: export templates and presets, headless CLI exports, Web threads and COOP/COEP, Windows and macOS signing, dedicated-server builds, PCK patches and the Shader Baker, with references for CLI and presets, Android and iOS, and CI export jobs. | `godot-meta` |
| [`godot-gdextension`](plugins/godot-gdextension) | skill | Native Godot 4 extensions with GDExtension, in C++ (godot-cpp) or Rust (godot-rust gdext). Use when a project has a .gdextension file, SConstruct or a godot-cpp submodule, or when binding a native class, building per-platform libraries, wrapping a C/C++ library, or debugging a native crash. | - |
| [`godot-mcp-setup`](plugins/godot-mcp-setup) | skill | Manual /godot-mcp-setup: installs the voidrot/godot-mcp editor addon into a Godot 4 project, enables it, reads its port and writes the project .mcp.json godot-editor entry after you approve the diff. | `godot-meta` |
| [`godot-multiplayer`](plugins/godot-multiplayer) | skill | Builds and secures networked Godot 4 games: server-authoritative @rpc validation, ENet and WebSocket peers, MultiplayerSpawner and MultiplayerSynchronizer, lobbies, dedicated servers, interpolation and prediction. Use for @rpc, "multiplayer", "netcode" or a headless server in a Godot project. | - |
| [`godot-physics`](plugins/godot-physics) | skill | Godot 4 physics skill: CharacterBody controllers and move_and_slide, rigid, static, animatable and area bodies, collision layers and masks, raycasts and space queries, physics interpolation and Jolt, with references for controller recipes, queries, ragdolls and soft bodies. | `godot-meta` |
| [`godot-shaders`](plugins/godot-shaders) | skill | Godot 4 shaders and VFX skill: .gdshader canvas_item, spatial and particles shaders, uniforms and hints, screen and depth reading, visual shaders and materials, GPU particles, with references for shader fundamentals, effect recipes, particles, stencil, CompositorEffect and the Shader Baker. | `godot-meta` |
| [`godot-testing`](plugins/godot-testing) | skill | Godot 4 testing skill: picks GUT, gdUnit4 or a bare SceneTree runner from the project, writes tests, runs them headless with real exit codes, and sets up CI, with GUT and gdUnit4 references. | `godot-meta` |
| [`godot-xr`](plugins/godot-xr) | skill | Godot 4 XR with OpenXR for VR, AR and passthrough on Meta Quest, Pico and PC VR. Use for XROrigin3D and XRController3D setup, the action map, locomotion, grabbing, in-world UI, hand tracking, passthrough, spatial anchors, or a Quest export, and when project.godot has xr/openxr/enabled=true. | - |
| [`level-design`](plugins/level-design) | skill | Engine-agnostic level design: player metrics, blockout to playable, critical path and gating, pacing and tension curves, encounters, readability, and seeded procedural generation (noise, rooms and corridors, BSP, cellular caves, WFC). | `gamedev-core` |
| [`msbuild`](plugins/msbuild) | skill | Diagnoses MSBuild failures and slow builds and reviews .NET build XML. Use for a failing dotnet build, restore, pack or publish, .csproj/.props/.targets conditions and custom targets, binlog capture and replay, "it rebuilds when nothing changed", slow evaluation or builds, bin/obj clashes, or Directory.Build.* layering. | `dotnet-meta` |
| [`nuget`](plugins/nuget) | skill | Manages NuGet dependencies and packages in .NET repos. Use for Directory.Packages.props and Central Package Management, bumping or aligning package versions, NU1xxx restore warnings, nuget.config sources and source mapping, vulnerable-package audits, lock files, dotnet pack metadata, or publishing to nuget.org with trusted publishing. | `dotnet-meta` |
| [`roslyn-analyzers`](plugins/roslyn-analyzers) | skill | Roslyn analyzer skill: DiagnosticAnalyzer, CodeFixProvider and IIncrementalGenerator design and tests, Microsoft.CodeAnalysis host-compatibility pinning, and analyzer NuGet packaging. | - |
| [`gh-readme`](plugins/gh-readme) | skill | README skill: write, restructure, audit and beautify a GitHub repository's README.md from facts in the repo, with templates by project type, a scored audit and link-check script, honest shields.io badges, dark/light logos and GitHub rendering rules. | `github-meta` |
| [`coder-critical`](plugins/coder-critical) | agent | Coder agent, opus tier. concurrency, security-sensitive code, data migrations, core invariants, or a change a lower tier failed. Slower and dearer; use coder-max only if this tier fails. | `orchestration-meta` |
| [`coder-high`](plugins/coder-high) | agent | Coder agent, sonnet tier. a change coder struggled with or that needs careful design, like a tricky refactor, an API redesign or intricate tests. Use coder-critical for risky logic. | `orchestration-meta` |
| [`coder-max`](plugins/coder-max) | agent | Coder agent, fable tier. the hardest changes, like a large cross-cutting refactor or a novel algorithm, or work coder-critical could not finish. Most expensive tier; reserve it for escalations. Not in orchestration-meta: install it per repo at local scope. | - |
| [`bash-rules`](plugins/bash-rules/README.md) | hook | Mod that denies Bash used to show file contents (use Read; searching with grep and find stays in Bash), write or edit files (use Write/Edit), smuggle encoded or env-var payloads, or destroy systems, infra and data. Commands the parser is unsure about are sent to Ollama (ollama.com for :cloud models), then to Haiku. | `baseline` |
| [`outline-mcp`](plugins/outline-mcp/README.md) | mcp | Outline's built-in MCP server (remote HTTP) for a self-hosted Outline wiki, signing in with OAuth through /mcp or with an API key from ~/.config/outline/api-key. Prompts for the hostname. | - |
| [`outline-docs`](plugins/outline-docs/README.md) | hook | SessionStart hook that tells Claude to record decisions, runbooks and other knowledge worth keeping in Outline as well as the repo. Installs outline-mcp. | - |
| [`atlassian-mcp`](plugins/atlassian-mcp/README.md) | mcp | Atlassian Rovo MCP server for Atlassian Cloud (remote HTTP at mcp.atlassian.com/v2/mcp, OAuth 2.1): Confluence, Jira and Compass. Sign in with /mcp. | - |
| [`atlassian-docs`](plugins/atlassian-docs/README.md) | hook | SessionStart hook that tells Claude to record knowledge worth keeping in Confluence and track follow-up work as Jira issues, as well as in the repo. Installs atlassian-mcp. | - |
| [`usage-log`](plugins/usage-log/README.md) | hook | Mod that logs skill use and the skill listing per prompt to local JSONL, for finding skills that should have fired and didn't. Ships usage-report, which summarizes this log and the bash-rules log. | - |
| [`tilt`](plugins/tilt) | skill | Tilt skill: write and debug Tiltfiles (docker_build, k8s_yaml, live_update, local_resource) for local Kubernetes dev loops, and run tilt non-interactively. | `kubernetes-meta` |
| [`mise`](plugins/mise) | skill | mise skill: configure mise.toml tools, env and tasks, migrate .tool-versions, and run commands under mise in non-interactive shells. | - |
| [`aws`](plugins/aws) | skill | General AWS skill: resolve account, region and identity first, sign-in with SSO or aws login, IAM policy and trust traps, AccessDenied debugging and cost-query habits. | `aws-meta` |
| [`aws-cli`](plugins/aws-cli) | skill | AWS CLI v2 mechanics for scripts and write commands: pagination, --query and output, timeouts, waiters, skeletons, dry runs and client tokens. Not for read-only inspection (aws-resource-query) or profiles, SSO and IAM (aws). | `aws-meta` |
| [`aws-mcp`](plugins/aws-mcp/README.md) | mcp | The managed AWS MCP Server (us-east-1) through the pinned mcp-proxy-for-aws SigV4 proxy over stdio: AWS docs search, regional availability, and run_script calls signed with your local profile. Optional profile name; blank uses the default credential chain. | `aws-meta` |
| [`aws-knowledge`](plugins/aws-knowledge/README.md) | mcp | AWS Knowledge MCP server (remote HTTP, no auth): AWS documentation search and reading, regional availability of services and APIs. Docs-only; use aws-mcp instead when you have credentials. | - |
| [`git-flow`](plugins/git-flow) | skill | Teaches Claude the git-flow branching model: detecting it, feature/release/hotfix procedures with git-flow-next, AVH or plain git, and when to pick another model. | - |
| [`hubflow`](plugins/hubflow) | skill | Teaches Claude to work in repos that use HubFlow (git hf), the archived GitHub-oriented git-flow fork, with warnings about its auto-pushing and merge behaviour. | - |
| [`trunk-based`](plugins/trunk-based) | skill | Teaches Claude trunk-based development: short-lived branches, feature flags, branch by abstraction, release from trunk or late-cut release branches with cherry-picks. | - |
| [`feature-flags`](plugins/feature-flags) | skill | Adds, uses, tests and removes feature flags in application code with the repo's own flag tool or OpenFeature, with a reference of common flag platforms. | `programming-core` |

### Agents

Each agent ships in its own plugin and is invoked as `plugin:agent`. Model and effort are defaults; a caller can pass another model per call. An agent without Edit/Write tools can still change state through Bash; `readonly-agent-gate` limits `architect`, `reviewer` and `debugger` to read-only Bash.

| Agent | Plugin | Model | Effort | Context | Edit/Write tools | In |
| --- | --- | --- | --- | --- | --- | --- |
| `architect:architect` | [`architect`](plugins/architect) | opus | high | 500k | no | `orchestration-meta` |
| `browser-tester:browser-tester` | [`browser-tester`](plugins/browser-tester) | sonnet | medium | 400k | no | `web-meta` |
| `coder:coder` | [`coder`](plugins/coder) | haiku | medium | 300k | yes | `orchestration-meta` |
| `coder-critical:coder-critical` | [`coder-critical`](plugins/coder-critical) | opus | high | 500k | yes | `orchestration-meta` |
| `coder-high:coder-high` | [`coder-high`](plugins/coder-high) | sonnet | medium | 400k | yes | `orchestration-meta` |
| `coder-max:coder-max` | [`coder-max`](plugins/coder-max) | fable | high | 300k | yes | - |
| `dba:dba` | [`dba`](plugins/dba) | opus | medium | 500k | yes | - |
| `debugger:debugger` | [`debugger`](plugins/debugger) | sonnet | high | 400k | no | `orchestration-meta` |
| `devops:devops` | [`devops`](plugins/devops) | opus | medium | 500k | yes | `iac-meta` |
| `open-source-release-audit:open-source-release-audit` | [`open-source-release-audit`](plugins/open-source-release-audit) | sonnet | high | 400k | no | - |
| `orchestration:orchestration` | [`orchestration`](plugins/orchestration) | inherit | - | - | yes | `orchestration-meta` |
| `plugin-vetter:plugin-vetter` | [`plugin-vetter`](plugins/plugin-vetter) | sonnet | medium | 400k | no | - |
| `reviewer:reviewer` | [`reviewer`](plugins/reviewer) | sonnet | high | 400k | no | `orchestration-meta` |
| `scribe:scribe` | [`scribe`](plugins/scribe) | haiku | medium | 300k | yes | `orchestration-meta` |
| `security-auditor:security-auditor` | [`security-auditor`](plugins/security-auditor) | opus | high | 500k | no | - |
| `shipper:shipper` | [`shipper`](plugins/shipper) | haiku | medium | 300k | no | `github-meta` |
| `ui-critic:ui-critic` | [`ui-critic`](plugins/ui-critic) | inherit | medium | 200k | no | `design-core` |
| `web-perf-auditor:web-perf-auditor` | [`web-perf-auditor`](plugins/web-perf-auditor) | sonnet | medium | 400k | no | `web-meta` |

<!-- catalog:end -->

## Contributing

### Layout

```
.claude-plugin/
  marketplace.json          lists every plugin
plugins/
  baseline/                 meta: .claude-plugin/plugin.json with a dependencies list
  <stack>-meta/             meta: same shape, installed at project scope
  programming-core/         core bundle: same shape, listed by several metas
  <name>/                   focused plugin
    .claude-plugin/
      plugin.json           name, version, description, author
    skills/<name>/SKILL.md  one of these components
    agents/<name>.md
    hooks/hooks.json
    .mcp.json
    README.md               only when the plugin needs setup (options, auth, binaries)
scripts/plugins.py          scaffolds plugins, checks the rules, and writes the catalog above
examples/claude-settings/   settings examples for each scope
```

### Rules

`scripts/plugins.py check` enforces these.

- A meta plugin is `baseline` or a name ending in `-meta`. It ships only `plugin.json`, plus an optional `README.md`. Its `dependencies` name focused plugins and core bundles from this marketplace, never another meta plugin.
- A core bundle is a plugin whose marketplace entry has `"category": "bundle"`, named `*-core` by convention (`programming-core`). The suffix alone doesn't make a bundle: `ef-core` and `aspnet-core` are ordinary plugins. A bundle has the same shape as a meta plugin, lists only focused plugins, and only meta plugins may depend on it. Use one when several metas share the same set.
- Every other plugin ships exactly one component. Supporting files such as `scripts/` or a skill's `references/` don't count.
- A focused plugin may depend on another focused plugin it calls, such as a skill that uses an MCP server plugin. A dependency from another marketplace must be listed in `allowCrossMarketplaceDependenciesOn`, which today allows `claude-code-lsps` (language servers) and `claude-plugins-official` (only for `csharp-lsp`).
- Names are lowercase kebab-case. `name`, `version`, and `description` match between `plugin.json` and `marketplace.json`.
- The catalog in this README is generated. Edit descriptions in `plugin.json` and `marketplace.json`, then run `scripts/plugins.py catalog`.

### Add a plugin

```
scripts/plugins.py new <name> --kind skill|agent|hook|mcp --description "..." [--meta python-meta|programming-core ...]
```

The script creates `plugins/<name>` with a `plugin.json` and a stub component, adds the marketplace entry, adds the plugin to each meta plugin or core bundle you name with `--meta`, and regenerates the catalog. Fill in the TODOs, then run the checks. For a mod (a TSX hooks module), use `--kind hook` and follow the `mod-authoring` skill.

To add an existing plugin to a meta plugin, append its name to the meta's `dependencies` in `plugins/<meta>/.claude-plugin/plugin.json`, then run `scripts/plugins.py catalog`.

### Plugins hosted elsewhere

A meta plugin can install a plugin from another marketplace. Add that marketplace to `allowCrossMarketplaceDependenciesOn` in `marketplace.json`, then list the dependency as an object.

```json
{ "name": "gopls", "marketplace": "claude-code-lsps" }
```

### Checks

Run these from the repo root.

| Purpose | Command |
| --- | --- |
| Check structure rules and the catalog | `python3 scripts/plugins.py check` |
| Register new plugin dirs and add them to metas | `python3 scripts/plugins.py register --meta <meta>=<plugin>,...` |
| Copy the shared Bash parser into the guard plugins | `python3 scripts/plugins.py sync-shared` |
| Check a Claude Code upgrade against the orchestration prompt | `plugins/orchestration/scripts/prompt-drift.sh [VERSION\|PATH]` |
| Test the drift check | `bash plugins/orchestration/scripts/prompt-drift.test.sh` |
| Test `plugins.py` | `uv run --with pytest pytest scripts/test_plugins.py` |
| Validate the marketplace | `claude plugin validate --strict .` |
| Validate one plugin | `claude plugin validate --strict plugins/<name>` |
| Test a plugin's mods hooks module | `claude plugin test plugins/<name>` |
| Try a plugin without installing it | `claude --plugin-dir plugins/<name>` |

### Release

Releases go through the `ship-plugin` skill, at `.claude/skills/ship-plugin/SKILL.md`. It validates the plugin, runs `scripts/plugins.py check`, runs the plugin's tests, commits to local `main`, and updates the installed copy. It does not push.

Bump `version` in `plugin.json` and the marketplace entry together, above the version on `origin/main`. An unchanged version means installed copies don't update. When you add a plugin to a meta plugin, bump the meta plugin too, so installs pick up the new dependency.

To tag a shipped version, run `claude plugin tag plugins/<name>`. It creates `<name>--v<version>`. Tags matter once a plugin declares a version range on a dependency, because ranges resolve against these tags.

## Acknowledgements

Some skills in this marketplace adapt ideas, structure, or text from these open-source skill collections. Each is used under its own license. Thanks to their authors.

| Project | License |
| --- | --- |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | MIT |
| [better-auth/skills](https://github.com/better-auth/skills) | No license file at the time of review |
| [samber/cc-skills](https://github.com/samber/cc-skills) | MIT |
| [samber/cc-skills-golang](https://github.com/samber/cc-skills-golang) | MIT |
| [samber/developer-platform-skills](https://github.com/samber/developer-platform-skills) | MIT |
| [affaan-m/ECC](https://github.com/affaan-m/ECC) | MIT |
| [mattpocock/skills](https://github.com/mattpocock/skills) | MIT |
| [wshobson/agents](https://github.com/wshobson/agents) | MIT |
