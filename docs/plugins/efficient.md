# efficient

Cost-conscious engineering skills for Claude Code. It covers coding, planning, testing, debugging, research, web work, and language and database guidance. It adds 20 skills and no hooks, agents, or scripts. Claude loads each skill on demand when its description matches the task.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `efficient:coding` | `efficient-coding` | Smallest correct change for a bounded feature, fix, or behavior-preserving refactor |
| `efficient:planning` | `efficient-planning` | Write or review a plan whose scope and verification are proportionate to risk |
| `efficient:testing` | `efficient-testing` | Decide, write, and run focused unit or regression tests for changed behavior |
| `efficient:e2e-testing` | `efficient-e2e-testing` | Write, run, and diagnose browser end-to-end tests for critical journeys |
| `efficient:problem-solving` | `problem-solving` | Diagnose a failure through reproduction and root-cause evidence, or pick an algorithm under constraints |
| `efficient:research` | `efficient-research` | Answer an external question from weighed sources with citations |
| `efficient:auth` | `efficient-auth` | Application-side authentication and server-side authorization |
| `efficient:web-development` | `efficient-web-development` | Build or repair a browser-facing feature end to end |
| `efficient:web-design` | `efficient-web-design` | Evidence-based visual design for an existing product, including `DESIGN.md` |
| `efficient:react` | `efficient-react` | React component boundaries, state, effects, and tests |
| `efficient:tanstack` | `efficient-tanstack` | TanStack Query, Router, Form, Table, Virtual, and Start |
| `efficient:javascript` | `efficient-javascript` | JavaScript runtime semantics: modules, promises, the event loop |
| `efficient:typescript` | `efficient-typescript` | Type-level and compiler work: `tsconfig`, narrowing, generics |
| `efficient:python` | `efficient-python` | Python typing, exceptions, asyncio, profiling, and pytest |
| `efficient:python-packaging` | `efficient-python-packaging` | Build and validate installable Python distributions |
| `efficient:fastapi` | `efficient-fastapi` | Bounded changes to existing FastAPI apps |
| `efficient:database-design` | `efficient-database-design` | Portable relational schema design and expand-contract migrations |
| `efficient:postgres` | `efficient-postgres` | Measured PostgreSQL diagnosis: plans, indexes, locks, vacuum |
| `efficient:golang` | `efficient-golang` | Idiomatic Go: errors, context, goroutine lifecycles, profiling |
| `efficient:rust` | `efficient-rust` | Rust ownership, errors, Cargo, async, and unsafe review |

Each description also names what the skill is not for and points to the sibling that is. For example, `efficient:coding` sends unknown-cause bugs to `efficient:problem-solving`.

## Requirements

- Claude Code with plugin support.
- No local tools. The skills are guidance only.
- References to skills in other plugins say "if installed" or name the plugin, such as `playwright-cli:playwright-cli`.

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

These skills moved from `~/.claude/skills/`. The `efficient-*` skills and `problem-solving` became `efficient:*`.

- Old bare names no longer resolve.
- Slash invocations such as `/efficient-coding` no longer work. Use `/efficient:coding`.
- Agent files that preload skills must use the qualified names, for example `efficient:coding`.
- The `quality` plugin declares this one as a dependency. While `quality` is enabled, `efficient` stays enabled.

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/efficient
   ```
2. Start a fresh session and check the skill list. It should show all 20 skills as `efficient:<name>`.

## Limits

- Skills load by description match. A task that fits no description loads nothing.
- Nothing is enforced. The skills shape how Claude works and do not block any tool.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable efficient@adminhead` |
| Uninstall | `claude plugin uninstall efficient@adminhead` |

`quality` declares `efficient` as a dependency, so `efficient` stays enabled while `quality` is enabled. The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
