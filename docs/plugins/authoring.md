# authoring

Skills for writing the files that steer Claude Code and the docs around a codebase. It covers Architecture Decision Records, Claude Code skills, agent instruction files such as `CLAUDE.md` and `AGENTS.md`, documentation audits, codebase maps, domain glossaries, agent teams, and audits of your Claude Code setup, including its security. It adds nine skills, all loaded on demand, and a hook pair that nudges you to check docs after code changes.

Version 0.2.0 added five skills. `authoring:create-skill` also gained references on porting third-party skills and writing for agents. Version 0.2.1 retuned the `create-skill` description around the phrasings people use when a skill never triggers or fires on the wrong requests. Version 0.3.0 added `authoring:agent-config-audit`, which moved here from the former `quality` plugin. Version 0.4.0 added the docs-sync nudge hook, plus a slice-landing reference and script for `authoring:agent-teams`. Version 0.4.1 turned the nudge from a blocking Stop error into non-error feedback. Version 0.4.2 puts team worktrees under `.claude/worktrees/<slice>` and the slice contract file at `.agents/plans/<slug>-contract.md`. Version 0.5.0 ports the docs-sync nudge from Python to TypeScript (bun), attributes changes by this session's recorded edits instead of the git tree, skips historical docs, and points at `path:line → name`.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `authoring:adr-writing` | `adr-writing` | Create, review, and maintain Markdown ADRs, including status changes, deprecation, and supersession |
| `authoring:create-skill` | `create-skill` | Design, write, restructure, or review a skill so it triggers on the right requests and stays lean |
| `authoring:manage-agent-instructions` | `manage-agent-instructions` | Create, restructure, prune, or reconcile `CLAUDE.md`, `.claude/rules/`, `CLAUDE.local.md`, and `AGENTS.md` from repo evidence |
| `authoring:docs-audit` | New | Audit docs against the code, read-only unless you ask for fixes. Ranks stale, missing, or contradictory docs P0 to P3 with evidence on both sides, and runs a script that checks documented commands, relative links, and env vars |
| `authoring:map-codebase` | New | Write an evidence-based map of an existing codebase (stack, structure, architecture, conventions, testing, concerns), with every claim traced to a file or command and unknowns marked |
| `authoring:domain-modeling` | New | Sharpen a project's domain model in conversation: challenge terms, resolve overloaded words, test edge cases, and write a `GLOSSARY.md` |
| `authoring:agent-teams` | New | Plan and run a Claude Code agent team: when a team beats subagents, team size, one owner per file, contract files, messaging, plan approval, shutdown |
| `authoring:config-audit` | New | Audit your installed Claude Code setup (skills, plugins, memory, hooks, permissions, MCP servers) for bloat and rot, with a verdict per item. Cleanup is soft-delete only |
| `authoring:agent-config-audit` | Security review of `CLAUDE.md`, `settings.json`, `.mcp.json`, hooks, and subagent definitions for injection text, over-broad permissions, secrets, and fail-open hooks. Read-only and model-driven |

Each description names its neighbors. `create-skill` hands measured trigger evals to `skill-creator:skill-creator`. `manage-agent-instructions` hands quick audits to `claude-md-management:claude-md-improver`. `docs-audit` hands `CLAUDE.md` and `AGENTS.md` to `manage-agent-instructions` and codebase maps to `map-codebase`. `config-audit` hands security review of config to `agent-config-audit`, and `agent-config-audit` hands bloat and rot review back to `config-audit`.

## Docs-sync nudge

Three hooks share `scripts/docs-sync-nudge.ts`. A SessionStart hook records `HEAD` for the session. A synchronous PostToolUse hook (matcher `Edit|Write|MultiEdit|NotebookEdit`) appends each edited `file_path` or `notebook_path` to a per-session list. A Stop hook looks only at that list, so another session's uncommitted work or commits never count. Paths outside the repo (other worktrees) are dropped.

At Stop, for the non-doc files this session edited, it searches `*.md`, `*.mdx`, `*.rst`, and `*.adoc` files, skipping `docs/plans/`, `docs/research/`, `docs/adr/`, `.agents/`, and `CHANGELOG*`, which record a moment rather than describe current code. It nudges Claude once with non-error feedback (Stop `additionalContext`, not a blocking `decision`) that lists up to 10 docs as `path:line → name`, and asks Claude to check them or offer `authoring:docs-audit`. Two tiers, in order:

1. Docs that name something that no longer exists in code. The names come from the removed lines of `git diff -U0 <recorded HEAD> -- <edited files>`: code-like words of 4 or more characters (`snake_case`, `camelCase`, `CONST_CASE`, `--flag`) that no tracked or untracked non-doc file still contains.
2. Docs that mention an edited file, by full path first and then by basename.

A doc appears once, at its best tier. Docs you edited this session are dropped.

- It fires once per change set. A hash of the sorted edited code paths is kept per session in `${CLAUDE_PLUGIN_DATA}`, so the same set never nudges twice. Another edited file makes a new set.
- Edits made through Bash (`sed -i`, `mv`, code generators) are not seen.
- Subagent edits: Claude Code's hook docs put `session_id` on every hook input and add `agent_id` and `agent_type` inside a subagent, without saying which session id a subagent carries. Subagent transcripts under `~/.claude/projects/<project>/<session>/subagents/*.jsonl` record the parent's `sessionId`, so hooks are expected to carry it too and subagent edits are attributed to the parent session. Not tested against a live subagent hook.
- Edits under a gitignored path (such as subagent worktrees in `.claude/worktrees/`) and inside a nested repo or worktree are dropped.
- It exits quietly when `stop_hook_active` is set, outside a git repo, or on any error, so it never traps a session.
- To turn it off, disable the plugin. There is no per-hook setting.

## Slice landing

`authoring:agent-teams` has a `references/slice-landing.md` with a contract-file template and the land protocol. `scripts/land-slice.sh <parent-branch> "<check command>"` runs from a slice's worktree. Under an exclusive `flock` on `<git-common-dir>/slice-land.lock`, it rebases the slice on the parent, runs the check, and fast-forwards the parent. It exits 1 without moving the parent on a rebase conflict (the rebase is aborted) or a failed check.

## Requirements

- `git` and [bun](https://bun.sh) for the docs-sync hooks, run as `bun --no-env-file --config=/dev/null`. `git` and `flock` (util-linux) for `land-slice.sh`.
- Python 3 for `adr-writing`, `create-skill`, `docs-audit`, and `map-codebase`. Their scripts are `new_adr.py`, `scaffold_skill.py`, `validate_skill.py`, `docs_drift.py`, and `detect_stack.py`. `docs_drift.py` and `detect_stack.py` use only the standard library and change nothing.
- `git` for `docs_drift.py`, which resolves the commit in a doc's `Fingerprint: git:<sha>` header to flag stale docs.
- `agent-teams` needs an interactive session and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. Split panes need tmux or iTerm2 with the `it2` CLI. See Limits.
- `config-audit` asks you to run `/context` for real token counts, because Claude cannot run it. `claude plugin details <name>` gives a per-plugin cost.
- `manage-agent-instructions`, `domain-modeling`, and `agent-config-audit` have no scripts and need nothing.
- `agent-config-audit` runs no scanner. It reads the config files itself.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install authoring@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/authoring
```

## Migrating from user-level skills

The first three skills moved from `~/.claude/skills/` with the same names. The five added in 0.2.0 and `agent-config-audit` are new to this plugin.

The old name of `agent-config-audit` is listed in the [efficient family page](efficient.md).

- Old bare names no longer resolve. Use `authoring:adr-writing` and so on.
- Prompts such as "Write an ADR for this decision" still load `authoring:adr-writing` on their own.

## Script permissions

Scripts run through `${CLAUDE_SKILL_DIR}`, with `allowed-tools` grants so they run without a permission prompt while the skill is active.

| Skill | Granted command |
| --- | --- |
| `authoring:adr-writing` | `python3 ${CLAUDE_SKILL_DIR}/scripts/new_adr.py *` |
| `authoring:create-skill` | `python3 ${CLAUDE_SKILL_DIR}/scripts/scaffold_skill.py *` and `python3 ${CLAUDE_SKILL_DIR}/scripts/validate_skill.py *` |
| `authoring:docs-audit` | `python3 ${CLAUDE_SKILL_DIR}/scripts/docs_drift.py *` |
| `authoring:map-codebase` | `python3 ${CLAUDE_SKILL_DIR}/scripts/detect_stack.py *` |
| `authoring:agent-config-audit` | No script. A read grant, `Read(~/.claude/**)`. Reads elsewhere prompt, which keeps a prompt-injected file from steering reads to credential paths |

For a directory marketplace, `${CLAUDE_SKILL_DIR}` resolves to the marketplace source directory, not the plugin cache.

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/authoring
   ```
2. Start a fresh session and check the skill list. It should show all nine skills as `authoring:<name>`.
3. Ask Claude to "Write an ADR" for a sample decision. It should load `authoring:adr-writing`.

## Tests

```
bash plugins/authoring/scripts/tests/check-docs-sync.sh
bash plugins/authoring/scripts/tests/check-land-slice.sh
```

Both use temporary repos and need no network.

## Limits

- Checked in the migration: an `adr-writing` dry run, and the `create-skill` validator on a plugin skill. Both ran with no permission denials. The scaffolder and `manage-agent-instructions` were not run.
- `create-skill` overlaps with `skill-creator:skill-creator`, and `manage-agent-instructions` overlaps with `claude-md-management`. The descriptions split the scope, and both sides can load for a borderline request.
- `authoring:map-codebase` writes its map to `docs/codebase-map.md` unless the repo already has a home for such docs.
- `authoring:agent-teams` sets an experimental flag with a side effect. While `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is on, any subagent Claude names launches as a teammate without confirmation. Enable it only for the session or project that needs a team, and set it to `0` afterward. In `-p` mode Claude does not spawn teammates.
- `authoring:agent-config-audit` is model-driven and runs no scanner. Its `Read(~/.claude/**)` grant covers the user config directory only, so reading a project file outside it can prompt.
- `authoring:config-audit` is read-only until you approve an item. It confirms one item at a time, removes by disabling or moving to a dated trash directory, and works only inside `~/.claude/`, `~/.claude.json`, the project's `.claude/`, and the root `.mcp.json`.
- `authoring:docs-audit` checks only what has a definite answer: `npm run` and `make` commands in code, relative links, env var names, and `Fingerprint` headers. It does not judge prose, so the skill compares that by hand.
- `docs_drift.py` and `detect_stack.py` ship with tests under their skills' `tests/` directories. The migration-time checks above did not cover them.
- Python 3 must be on `PATH`.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable authoring@adminhead` |
| Uninstall | `claude plugin uninstall authoring@adminhead` |

Both commands remove the skills and the docs-sync hooks. Start a new session to be sure they are gone.
