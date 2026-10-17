# claude-plugins

Claude Code plugin marketplace `adminhead`. It has three kinds of plugin:

- `baseline`, a meta plugin you install once at user scope. It pulls in the plugins every session should have.
- Project meta plugins (`python-meta`, `golang-meta`, `rust-meta`, `node-typescript-meta`, `web-meta`, `design-meta`, `iac-meta`, `kubernetes-meta`, `github-meta`) that you install at project scope. Each pulls in the plugins for one kind of project. `orchestration-meta` adds a main orchestration agent and a set of general-purpose agents.
- Core bundles shared by several metas: `programming-core` (general programming, installed by the language and web metas) and `design-core` (UI and UX design, installed by `web-meta` and `design-meta`). A project with two such metas gets one copy.
- Focused plugins. Each ships exactly one component: one skill, agent, hook config, or MCP server. Install them through a meta plugin or on their own.

Small plugins keep context cost down. You load only the skills and servers a project uses, and each skill's description competes with fewer others in the skill listing.

## Prerequisites

These plugins expect [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) to be installed and configured already. It is the default code intelligence: skills and agents query its code graph for symbols, call paths, and architecture before they fall back to `rg` and file reads.

The plugins do not ship it. Install it yourself. Its installer sets up its own hooks, its MCP server, and its `codebase-memory` skill in your user config, so no plugin here registers them again.

[`examples/claude-settings`](examples/claude-settings/README.md) has starting points for user, project, and local settings.

## Quick start

Add the marketplace once. Use a local clone, the GitHub repo, or a git URL.

| Task | Command |
| --- | --- |
| Add from a local clone | `claude plugin marketplace add /path/to/claude-plugins` |
| Add from GitHub | `claude plugin marketplace add Adminhead/claude-plugins` |
| Add from a URL | `claude plugin marketplace add <url>` |
| Install the default set | `claude plugin install baseline@adminhead --scope user` |
| Install a stack set for a project | `claude plugin install python-meta@adminhead --scope project` |
| Install one plugin | `claude plugin install <plugin>@adminhead --scope <scope>` |
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
| [`baseline`](plugins/baseline) | user | `git-commit`, `recommend-plugins`, `handoff`, `check-bypass-guard`, `bash-danger-guard`, `git-statusline`, `usage-band`, `mcp-health` | The adminhead default set, installed at user scope: the plugins every session should have. Ships no components of its own. |
| [`python-meta`](plugins/python-meta) | project | `programming-core`, `python`, `python-packaging`, `dependency-vetting`, `pyright@claude-code-lsps` | Plugin set for Python projects, installed at project scope. Ships no components of its own. |
| [`golang-meta`](plugins/golang-meta) | project | `programming-core`, `golang`, `gopls@claude-code-lsps` | Plugin set for Go projects, installed at project scope. Ships no components of its own. |
| [`rust-meta`](plugins/rust-meta) | project | `programming-core`, `rust`, `rust-analyzer@claude-code-lsps` | Plugin set for Rust projects, installed at project scope. Ships no components of its own. |
| [`node-typescript-meta`](plugins/node-typescript-meta) | project | `programming-core`, `javascript`, `typescript`, `dependency-vetting`, `vtsls@claude-code-lsps` | Plugin set for Node.js and TypeScript projects, installed at project scope. Ships no components of its own. |
| [`web-meta`](plugins/web-meta) | project | `programming-core`, `design-core`, `web-development`, `react`, `vite`, `e2e-testing`, `playwright-cli`, `browser-tester`, `web-perf-auditor` | Plugin set for web front-end projects, installed at project scope. Ships no components of its own. |
| [`design-meta`](plugins/design-meta) | project | `design-core`, `uiux-lookup`, `design-critique`, `design-system`, `design-handoff` | Plugin set for design work (new UI direction, rendered critique, UX rules and copy, accessibility, design systems and handoff) in any repo, installed at project scope. Ships no components of its own. |
| [`iac-meta`](plugins/iac-meta) | project | `terraform`, `ansible`, `docker`, `bash`, `cloud-ops-guard`, `devops`, `bash-language-server@claude-code-lsps` | Plugin set for infrastructure-as-code projects, installed at project scope. Ships no components of its own. |
| [`kubernetes-meta`](plugins/kubernetes-meta) | project | `kubernetes`, `helm`, `gitops` | Plugin set for Kubernetes projects (manifests, Helm, GitOps), installed at project scope. Ships no components of its own. |
| [`github-meta`](plugins/github-meta) | project | `gh-issues`, `gh-pr`, `pr-comments`, `ship`, `shipper`, `gh-actions`, `dependabot` | Plugin set for GitHub workflows (issues, pull requests, Actions, Dependabot), installed at project scope. Ships no components of its own. |
| [`orchestration-meta`](plugins/orchestration-meta) | user or project | `orchestration`, `agent-router`, `coder`, `architect`, `reviewer`, `debugger`, `scribe`, `readonly-agent-gate` | Orchestrated sessions: a main orchestration agent, the hook that builds its routing rules from the installed agents, and a set of general-purpose agents. Ships no components of its own. |

### Core bundles

| Plugin | Installs | Used by | Description |
| --- | --- | --- | --- |
| [`programming-core`](plugins/programming-core) | `coding`, `problem-solving`, `planning`, `unit-testing`, `test-run` | `golang-meta`, `node-typescript-meta`, `python-meta`, `rust-meta`, `web-meta` | Core bundle of general programming plugins that the language and web metas install. Ships no components of its own. |
| [`design-core`](plugins/design-core) | `ui-direction`, `ui-critic`, `web-design`, `screen-reader-testing`, `accessibility-review`, `ux-copy` | `design-meta`, `web-meta` | Core bundle of UI and UX design plugins that the web and design metas install. Ships no components of its own. |

### Plugins

| Plugin | Type | Description | In |
| --- | --- | --- | --- |
| [`accessibility-review`](plugins/accessibility-review) | skill | Audits a design, mockup or page against WCAG 2.2 AA at design level: contrast, focus visibility, target size, keyboard and dragging alternatives, labels, errors and authentication. Use for "audit accessibility", "check a11y", "is this accessible?" or a WCAG check before handoff. | `design-core` |
| [`agent-router`](plugins/agent-router) | hook | Mod that lists the installed agent types, each with when to use it, in the Agent tool's description when the main thread runs the orchestration agent, so new agents get routes without editing it. | `orchestration-meta` |
| [`ansible`](plugins/ansible) | skill | Ansible skill: playbooks, roles and inventories with idempotency proof, check-mode limits, validate hooks, vault or sops secrets, and ansible-lint style. | `iac-meta` |
| [`architect`](plugins/architect) | agent | A read-only planning subagent that grounds an implementation plan in the code and returns ordered, verifiable slices with risks and rejected alternatives, optionally stress-tested by an outside model. | `orchestration-meta` |
| [`bash`](plugins/bash) | skill | Bash skill: defensive scripts with strict mode and its holes, quoting, trap cleanup, argument parsing, ShellCheck configuration and Bats tests. | `iac-meta` |
| [`bash-danger-guard`](plugins/bash-danger-guard) | hook | Mod that denies destructive Bash (rm -rf of root, system or home paths, disk wipes, recursive system chmod/chown, sudo) and unparseable or oversized commands, and asks before force-pushes, hard resets and piped installers like curl | sh. | `baseline` |
| [`browser-tester`](plugins/browser-tester) | agent | Agent that verifies a running web app in a real browser against acceptance criteria with playwright-cli, returning pass, fail or blocked per criterion with evidence. | `web-meta` |
| [`check-bypass-guard`](plugins/check-bypass-guard) | hook | Hook that denies git hook and signing bypasses (--no-verify, commit -n, --no-gpg-sign, core.hooksPath overrides, SKIP=) and asks before edits to existing lint, format and pre-commit configs or their ignore files. Needs bun. | `baseline` |
| [`click-path-audit`](plugins/click-path-audit) | skill | Audits UI event handlers for behavior bugs. It maps each state action's side effects, then traces every handler call in order to find sequential undo, async races, stale closures, dead paths and effects that reset what a click just set. Use when a button does nothing or leaves the wrong state though each function works alone, or after a shared-state refactor. | - |
| [`cloud-ops-guard`](plugins/cloud-ops-guard) | hook | PreToolUse guard (needs bun) that denies unsafe tofu, terraform and terragrunt applies, destroys, imports and state surgery, and gates subagent plan and aws calls. | `iac-meta` |
| [`coder`](plugins/coder) | agent | A general implementer subagent for one bounded code change, end to end: smallest correct edit, a real check that exercises it, and a diff report. The caller picks the model per call. | `orchestration-meta` |
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
| [`orchestration`](plugins/orchestration) | agent | Main-session orchestrator agent that plans, routes work to the installed agents and verifies their results. Start it with `claude --agent orchestration:orchestration` or the `agent` setting. | `orchestration-meta` |
| [`planning`](plugins/planning) | skill | Writes, reviews, or revises implementation plans whose scope, verification, and reruns are proportionate to risk. Use for "plan this", "review this plan", "cheapest way to verify", work spanning several slices or risky boundaries, acceptance criteria for an ambiguous change, multi-agent or multi-session plans, and "grill me" stress-tests. | `programming-core` |
| [`playwright-cli`](plugins/playwright-cli) | skill | Drive a headless, isolated browser from Bash with playwright-cli: inspect pages, fill forms, take screenshots, debug console and network errors, and run smoke QA. | `web-meta` |
| [`pr-comments`](plugins/pr-comments) | skill | Manual /pr-comments: pull a PR's unresolved review threads and review summaries into context, triage them, and fix the ones you pick. Read-only on GitHub. | `github-meta` |
| [`prisma`](plugins/prisma) | skill | Prisma ORM 6 and 7 traps for TypeScript backends, such as updateMany returning a count, interactive transaction timeouts, migrate dev resets, edited applied migrations, undefined filters, P2002/P2025/P2003 handling, serverless connections and driver adapters. Use when writing a Prisma schema, query, transaction or migration, or debugging one. | - |
| [`problem-solving`](plugins/problem-solving) | skill | Root-cause diagnosis for failures, flaky tests and performance regressions: a red-capable feedback loop, competing falsifiable hypotheses, one-variable probes and evidence-backed fixes. Also algorithm choice under unclear constraints. | `programming-core` |
| [`production-readiness`](plugins/production-readiness) | skill | Evidence-based ship-or-block review (Blocked, Risky or Caveats) of an application before launch, built from local repo evidence. | - |
| [`python`](plugins/python) | skill | Python idiom, review and diagnosis: typing, exceptions, resource lifetimes, asyncio, retries and background jobs, profiling and pytest. | `python-meta` |
| [`python-packaging`](plugins/python-packaging) | skill | Build and validate Python distributions and uv workflows: pyproject.toml, package data, entry points, wheel and sdist checks, uv in CI and Docker, and PyPI trusted publishing. | `python-meta` |
| [`react`](plugins/react) | skill | Changes, reviews and debugs React components: state ownership, effects, keys, render purity, Server Components and Actions, accessibility, measured performance, React 19 upgrades and component tests. Use for .tsx/.jsx behavior or render cost, such as "this list lags when I type", "it re-renders too much", effect loops or hydration mismatches. | `web-meta` |
| [`readonly-agent-gate`](plugins/readonly-agent-gate) | hook | PreToolUse hook that limits the read-only agents (architect, reviewer, debugger, plus any you list) to Bash commands that don't write outside /tmp and the session scratchpad. Needs bun. | `orchestration-meta` |
| [`recommend-plugins`](plugins/recommend-plugins) | skill | Inspects the current project, proposes the adminhead meta plugins, bundles and focused plugins that fit it from the live catalog, and installs the ones you confirm at local or project scope. Manual command. | `baseline` |
| [`reviewer`](plugins/reviewer) | agent | A read-only review subagent for implementation plans, designs and diffs, checked against the brief and its acceptance criteria, returning verified findings ranked by severity. The caller picks quick or thorough depth. | `orchestration-meta` |
| [`rollout-plan`](plugins/rollout-plan) | skill | Plans and verifies production rollouts: strategy choice, preflight go/no-go, phased verification signals, numeric rollback criteria and post-deploy follow-up. | - |
| [`rust`](plugins/rust) | skill | Rust language skill: ownership and lifetimes, error design, traits and modules, Cargo features, async and concurrency, unsafe review, clippy and measured performance. | `rust-meta` |
| [`screen-reader-testing`](plugins/screen-reader-testing) | skill | Plan, run with the user and report manual screen-reader and keyboard tests of a built web journey (NVDA, JAWS, VoiceOver, Orca, TalkBack). | `design-core` |
| [`scribe`](plugins/scribe) | agent | A documentation subagent that writes and updates READMEs, guides, docstrings and changelogs, checking every claim against the code and marking anything it could not verify. | `orchestration-meta` |
| [`ship`](plugins/ship) | skill | Ship finished work in one run: commit, push, and optionally open a PR, watch checks and merge, delegated to the shipper agent. | `github-meta` |
| [`shipper`](plugins/shipper) | agent | Agent that commits finished work, pushes it, and optionally opens a PR, watches checks and merges, on a cheap model. Used by the ship skill. | `github-meta` |
| [`tanstack`](plugins/tanstack) | skill | Works with TanStack Query, Router, Form, Table, Virtual and Start: state ownership, query keys, cache invalidation, loaders, search-param validation, server-driven tables, virtualization and SSR boundaries. Use when code imports @tanstack/*, or for stale or duplicate data, lost form values, table and pagination mismatches, or Start server functions. | - |
| [`terraform`](plugins/terraform) | skill | Terraform, OpenTofu and Terragrunt skill: safe plan and saved-plan apply, plan review, state and refactoring blocks, Terratest, and security scanning with Trivy, Checkov and OPA. | `iac-meta` |
| [`test-gap-audit`](plugins/test-gap-audit) | skill | Read-only audit of missing, weak and stale tests for a repo, PR or feature: maps source to tests with a bundled script and ranks gaps P0-P3 by behavior and risk, never by coverage percentage. | - |
| [`test-run`](plugins/test-run) | skill | Manual test-run command: detects the test runner, runs the tests affected by your changes, prints only compact failures, and fixes them in a bounded loop. | `programming-core` |
| [`ts-module-boundaries`](plugins/ts-module-boundaries) | skill | Sets up dependency-cruiser in a TypeScript repo so each package is reachable only through its root entry-point files, with no deep imports and no cycles, then proves the rules fail on a violation. Use when the user asks to enforce package boundaries, stop deep imports or add dependency-cruiser. | - |
| [`typescript`](plugins/typescript) | skill | Handles TypeScript type-level and compiler work, covering tsconfig strictness, narrowing, generics, discriminated unions, declarations and module resolution, public type APIs, runtime validation of unknown data, and type tests. Use when editing *.ts/*.tsx types or tsconfig.json, or fixing tsc errors. | `node-typescript-meta` |
| [`ui-critic`](plugins/ui-critic) | agent | Renders a built web page or local HTML file headless at 1440/768/390 px, runs lint and inspect checks, critiques the screenshots and returns at most three ranked fixes with FAIL/WARN counts. Use after building or restyling a page, or when asked why a rendered page looks generic. Not for mockups, e2e tests or WCAG audits. | `design-core` |
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
- A core bundle is a name ending in `-core`, such as `programming-core`. It has the same shape as a meta plugin, lists only focused plugins, and only meta plugins may depend on it. Use one when several metas share the same set.
- Every other plugin ships exactly one component. Supporting files such as `scripts/` or a skill's `references/` don't count.
- A focused plugin may depend on another focused plugin it calls, such as a skill that uses an MCP server plugin. A dependency from another marketplace must be listed in `allowCrossMarketplaceDependenciesOn`, which today allows `claude-code-lsps`.
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
