# authoring

Skills for writing the files that steer Claude Code and the docs around a codebase. It covers Architecture Decision Records, Claude Code skills, agent instruction files such as `CLAUDE.md` and `AGENTS.md`, documentation audits, codebase maps, domain glossaries, agent teams, and audits of your Claude Code setup, including its security. It adds nine skills, all loaded on demand.

Version 0.2.0 added five skills. `authoring:create-skill` also gained references on porting third-party skills and writing for agents. Version 0.2.1 retuned the `create-skill` description around the phrasings people use when a skill never triggers or fires on the wrong requests. Version 0.3.0 added `authoring:agent-config-audit`, which moved here from the former `quality` plugin.

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

## Requirements

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

The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
