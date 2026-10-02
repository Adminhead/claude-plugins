# authoring

Skills for writing the files that steer Claude Code. It covers Architecture Decision Records, Claude Code skills, and agent instruction files such as `CLAUDE.md` and `AGENTS.md`. It adds three skills, all loaded on demand.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `authoring:adr-writing` | `adr-writing` | Create, review, and maintain Markdown ADRs, including status changes, deprecation, and supersession |
| `authoring:create-skill` | `create-skill` | Design, write, restructure, or review a skill so it triggers on the right requests and stays lean |
| `authoring:manage-agent-instructions` | `manage-agent-instructions` | Create, restructure, prune, or reconcile `CLAUDE.md`, `.claude/rules/`, `CLAUDE.local.md`, and `AGENTS.md` from repo evidence |

Each description names its neighbors. `create-skill` hands measured trigger evals to `skill-creator:skill-creator`. `manage-agent-instructions` hands quick audits to `claude-md-management:claude-md-improver`.

## Requirements

- Python 3 for `adr-writing` and `create-skill`. Their scripts are `new_adr.py`, `scaffold_skill.py`, and `validate_skill.py`.
- `manage-agent-instructions` has no scripts and needs nothing.

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

These skills moved from `~/.claude/skills/` with the same names.

- Old bare names no longer resolve. Use `authoring:adr-writing` and so on.
- Prompts such as "Write an ADR for this decision" still load `authoring:adr-writing` on their own.

## Script permissions

Scripts run through `${CLAUDE_SKILL_DIR}`, with `allowed-tools` grants so they run without a permission prompt while the skill is active.

| Skill | Granted command |
| --- | --- |
| `authoring:adr-writing` | `python3 ${CLAUDE_SKILL_DIR}/scripts/new_adr.py *` |
| `authoring:create-skill` | `python3 ${CLAUDE_SKILL_DIR}/scripts/scaffold_skill.py *` and `python3 ${CLAUDE_SKILL_DIR}/scripts/validate_skill.py *` |

For a directory marketplace, `${CLAUDE_SKILL_DIR}` resolves to the marketplace source directory, not the plugin cache.

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/authoring
   ```
2. Start a fresh session and check the skill list. It should show `authoring:adr-writing`, `authoring:create-skill`, and `authoring:manage-agent-instructions`.
3. Ask Claude to "Write an ADR" for a sample decision. It should load `authoring:adr-writing`.

## Limits

- Checked in the migration: an `adr-writing` dry run, and the `create-skill` validator on a plugin skill. Both ran with no permission denials. The scaffolder and `manage-agent-instructions` were not run.
- `create-skill` overlaps with `skill-creator:skill-creator`, and `manage-agent-instructions` overlaps with `claude-md-management`. The descriptions split the scope, and both sides can load for a borderline request.
- Python 3 must be on `PATH`.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable authoring@adminhead` |
| Uninstall | `claude plugin uninstall authoring@adminhead` |

The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
