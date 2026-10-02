# ripgrep

Teaches Claude Code to search with [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) instead of `grep` or `find`. It adds a short block of search guidelines to each conversation and ships a skill with `rg` flag recipes.

## What it adds

| Component | Where | Effect |
| --- | --- | --- |
| `prompt.context` hook | `hooks/register.ts` | Appends a `codeSearch` block, "Code Search Guidelines", to the conversation's context |
| Skill `ripgrep:ripgrep` | `skills/ripgrep/SKILL.md` | Flag reference: bounding output, scoping, precise matching, ignore rules, finding files, pitfalls, recipes |

The block says:

- Prefer the built-in `Grep` tool or explicit `rg` commands over `grep`.
- Do not use `grep -r` or `find | xargs grep`. `rg` respects `.gitignore`, `.ignore`, and hidden-file rules by default.
- Load the `ripgrep:ripgrep` skill for flag details and output-bounding patterns.

## Requirements

- `rg` on `PATH`. The guidelines work without it, but the skill's commands need it.
- Written against rg 15.2.0. Other versions are untested.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install ripgrep@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/ripgrep
```

## What changes in a session

- The `codeSearch` block sits beside the `CLAUDE.md` content in the context. It is not part of `CLAUDE.md`.
- It is added once per conversation. The engine builds the context for the first message, caches the result, and recomputes it only after compaction, `/clear`, or invalidation. Each recompute starts from fresh core blocks, so the block never duplicates.
- The text is static, so it keeps the prompt cache warm.
- Claude loads the skill on demand. Its description matches tasks such as composing an `rg` command, replacing `grep` or `find`, listing files, searching ignored files, or fixing a search with too much or no output.
- Nothing edits `~/.claude/CLAUDE.md` or any project file.

## Configuration

None. The plugin has no `userConfig`, and the hook reads no options. The guideline text is a constant in `hooks/register.ts`.

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/ripgrep
   ```
   The output should list `prompt.context` under the hooks module.
2. Start a session and ask Claude to quote its "Code Search Guidelines" section. It should return the three bullets above.
   ```
   claude -p --plugin-dir plugins/ripgrep "Quote the 'Code Search Guidelines' section from your context, verbatim. Nothing else."
   ```

## Limits

- Tested on the main session and an `Explore` subagent. Other subagent types are untested.
- The block is guidance. It does not block `grep` or change any tool.
- Without `rg` on `PATH`, `rg` commands Claude composes will fail.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable ripgrep@adminhead` |
| Uninstall | `claude plugin uninstall ripgrep@adminhead` |

Both remove the guidance, since nothing is written outside the plugin. Start a new conversation to be sure the block is gone.
