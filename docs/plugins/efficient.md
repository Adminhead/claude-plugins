# efficient

Cost-conscious engineering skills for Claude Code. It covers coding, planning, debugging, testing, research, experiments, prototypes, modernization, web work, and guidance for languages, frameworks, databases, and auth. It adds 31 skills and no hooks, agents, or scripts. Claude loads each skill on demand when its description matches the task.

Version 0.2.0 added 11 skills and extended most existing ones. Version 0.2.1 retuned the `golang`, `testing`, `problem-solving`, and `react` descriptions to match the phrasings people type, and added a measure-first rule to `react`.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `efficient:coding` | `efficient-coding` | Smallest correct change for a bounded feature, fix, or behavior-preserving refactor |
| `efficient:planning` | `efficient-planning` | Write or review a plan whose scope and verification are proportionate to risk |
| `efficient:testing` | `efficient-testing` | Decide, write, and run focused unit or regression tests for changed behavior |
| `efficient:e2e-testing` | `efficient-e2e-testing` | Write, run, and diagnose browser end-to-end tests for critical journeys |
| `efficient:problem-solving` | `problem-solving` | Diagnose a failure through reproduction and root-cause evidence, or pick an algorithm under constraints |
| `efficient:experiment-loop` | New | Bounded, unattended optimize-and-measure loop on a dedicated branch: one hypothesis per commit, a fixed metric command, keep-or-revert, and a results log |
| `efficient:modernize` | New | Plan a legacy-system upgrade or migration with a feasibility spike, safety ladder, hazard review, and phased exit criteria |
| `efficient:prototype` | New | Throwaway prototype that answers one design question: a single-file HTML logic demo, or UI variants on one route |
| `efficient:research` | `efficient-research` | Answer an external question from weighed sources with citations |
| `efficient:auth` | `efficient-auth` | Application-side authentication and server-side authorization |
| `efficient:better-auth` | New | Add, configure, or debug the Better Auth TypeScript library: adapters, schema generation, plugins, trusted origins |
| `efficient:web-development` | `efficient-web-development` | Build or repair a browser-facing feature end to end |
| `efficient:web-design` | `efficient-web-design` | Evidence-based visual design for an existing product, including `DESIGN.md` |
| `efficient:vite` | New | Vite configuration and build behavior: client env exposure, chunking, SSR externals, dev-server problems (Vite 7 and 8) |
| `efficient:react` | `efficient-react` | React component boundaries, state, effects, and tests. With no profile, it gives Profiler steps first and adds no memoization until there are numbers |
| `efficient:vue` | New | Vue 3 Composition API, Pinia stores, and Nuxt 4 data fetching and hydration |
| `efficient:tanstack` | `efficient-tanstack` | TanStack Query, Router, Form, Table, Virtual, and Start |
| `efficient:javascript` | `efficient-javascript` | JavaScript runtime semantics: modules, promises, the event loop |
| `efficient:typescript` | `efficient-typescript` | Type-level and compiler work: `tsconfig`, narrowing, generics |
| `efficient:bash` | New | Defensive Bash scripts: strict mode, quoting, traps, ShellCheck, and Bats tests |
| `efficient:python` | `efficient-python` | Python typing, exceptions, asyncio, profiling, and pytest |
| `efficient:python-packaging` | `efficient-python-packaging` | Build and validate installable Python distributions |
| `efficient:fastapi` | `efficient-fastapi` | Bounded changes to existing FastAPI apps |
| `efficient:database-design` | `efficient-database-design` | Portable relational schema design and expand-contract migrations |
| `efficient:postgres` | `efficient-postgres` | Measured PostgreSQL diagnosis: plans, indexes, locks, vacuum |
| `efficient:mysql` | New | Measured MySQL and MariaDB diagnosis: EXPLAIN, composite indexes, InnoDB lock waits, online DDL |
| `efficient:redis` | New | Redis and Valkey usage: caching, TTL and key design, rate limits, locks, queues |
| `efficient:golang` | `efficient-golang` | Idiomatic Go: errors, context, goroutine lifecycles, tests |
| `efficient:golang-cli` | New | Go command-line tools with cobra and viper: flag and config precedence, exit codes, signal shutdown |
| `efficient:golang-performance` | New | Measurement-first Go performance: benchmarks with benchstat, pprof, escape analysis, GC tuning |
| `efficient:rust` | `efficient-rust` | Rust ownership, errors, Cargo, async, and unsafe review |

Each description also names what the skill is not for and points to the sibling that is. For example, `efficient:coding` sends unknown-cause bugs to `efficient:problem-solving`, and `efficient:database-design` sends engine-specific work to `efficient:postgres`, `efficient:mysql`, or `efficient:redis`.

## Requirements

- Claude Code with plugin support.
- No local tools. The skills are guidance only.
- `efficient:experiment-loop` commits on a dedicated git branch, so it needs `git`. It also needs a command that measures the goal and that you can run in the environment.
- Some skills name tools the project supplies, such as ShellCheck and Bats (`efficient:bash`) or benchstat (`efficient:golang-performance`). The plugin installs none of them.
- References to skills in other plugins say "if installed" or name the plugin, such as `playwright-cli:playwright-cli`, `github:actions`, `tooling:pre-commit`, or `api:oauth-provider`.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install efficient@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/efficient
```

## Migrating from user-level skills

The original 20 skills moved from `~/.claude/skills/`. The `efficient-*` skills and `problem-solving` became `efficient:*`. The 11 skills added in 0.2.0 are new and have no earlier names.

- Old bare names no longer resolve.
- Slash invocations such as `/efficient-coding` no longer work. Use `/efficient:coding`.
- Agent files that preload skills must use the qualified names, for example `efficient:coding`.
- The `quality` plugin declares this one as a dependency. While `quality` is enabled, `efficient` stays enabled.

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/efficient
   ```
2. Start a fresh session and check the skill list. It should show all 31 skills as `efficient:<name>`.

## Limits

- Skills load by description match. A task that fits no description loads nothing.
- Nothing is enforced. The skills shape how Claude works and do not block any tool.
- `efficient:experiment-loop` runs unattended only after you confirm its setup table. Confirm the scope, budget, and boundary before you say yes, because the loop cannot ask mid-run.
- Near neighbors, such as `efficient:postgres`, `efficient:mysql`, and `efficient:redis`, are split by their descriptions. A borderline prompt can load either one. Name the skill to force it.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable efficient@adminhead` |
| Uninstall | `claude plugin uninstall efficient@adminhead` |

`quality` declares `efficient` as a dependency, so `efficient` stays enabled while `quality` is enabled. The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
