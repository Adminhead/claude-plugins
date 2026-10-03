# code-search

Teaches Claude Code to search with [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) instead of `grep` or `find`, and to search public GitHub code through [grep.app](https://grep.app). It adds a short block of search guidelines to each conversation, ships a skill with `rg` flag recipes, and connects grep.app's remote MCP server with a skill for using it. Version 0.2.0 renamed the plugin from `ripgrep` and added grep.app.

## What it adds

| Component | Where | Effect |
| --- | --- | --- |
| `prompt.context` hook | `hooks/register.ts` | Appends a `codeSearch` block, "Code Search Guidelines", to the conversation's context |
| Skill `code-search:ripgrep` | `skills/ripgrep/SKILL.md` | Flag reference: bounding output, scoping, precise matching, ignore rules, finding files, pitfalls, recipes |
| Skill `code-search:grep-app` | `skills/grep-app/SKILL.md` | How to query public GitHub code for real-world usage of an API, option, config key, or error string |
| MCP server `grep-app` | `.mcp.json` | HTTP, `https://mcp.grep.app`, no auth. Shown as `plugin:code-search:grep-app`. Tool `mcp__plugin_code-search_grep-app__searchGitHub` |

The block says:

- Prefer the built-in `Grep` tool or explicit `rg` commands over `grep`.
- Do not use `grep -r` or `find | xargs grep`. `rg` respects `.gitignore`, `.ignore`, and hidden-file rules by default.
- Load the `code-search:ripgrep` skill for flag details and output-bounding patterns.
- Load the `code-search:grep-app` skill for real-world usage of an API, library, config key, or error string across public GitHub code.

## Requirements

- `rg` on `PATH`. The guidelines work without it, but the `ripgrep` skill's commands need it.
- Written against rg 15.2.0. Other versions are untested.
- Network access to `mcp.grep.app` for the `grep-app` server.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install code-search@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/code-search
```

### Migrating from ripgrep

The marketplace declares `"renames": {"ripgrep": "code-search"}`. On Claude Code 2.1.193 or later, a marketplace update rewrites `ripgrep@adminhead` to `code-search@adminhead` in your `enabledPlugins`. On older versions, or to do it by hand, swap them.

```
claude plugin uninstall ripgrep@adminhead
claude plugin install code-search@adminhead
```

Do not keep both installed. Claude Code reports two blocks named `codeSearch` and skips one of them. The old skill name `ripgrep:ripgrep` no longer exists. Use `code-search:ripgrep`.

## What changes in a session

- The `codeSearch` block sits beside the `CLAUDE.md` content in the context. It is not part of `CLAUDE.md`.
- It is added once per conversation. The engine builds the context for the first message, caches the result, and recomputes it only after compaction, `/clear`, or invalidation. Each recompute starts from fresh core blocks, so the block never duplicates.
- The text is static, so it keeps the prompt cache warm.
- Claude loads each skill on demand. The `ripgrep` description matches tasks such as composing an `rg` command, replacing `grep` or `find`, listing files, searching ignored files, or fixing a search with too much or no output. The `grep-app` description matches requests for real-world usage examples or an exact error string.
- The `grep-app` server starts with the plugin. Claude Code defers MCP tool definitions, so the tool adds little to each session.
- Nothing edits `~/.claude/CLAUDE.md` or any project file.
- `efficient-core:research` routes public code examples to `code-search:grep-app`, if installed.

## Configuration

None. The plugin has no `userConfig`, and the hook reads no options. The guideline text is a constant in `hooks/register.ts`.

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/code-search
   ```
   The output should list `prompt.context` under the hooks module.
2. Start a session and ask Claude to quote its "Code Search Guidelines" section. It should return the four bullets above.
   ```
   claude -p --plugin-dir plugins/code-search "Quote the 'Code Search Guidelines' section from your context, verbatim. Nothing else."
   ```
3. Check the server. `/mcp` in a session, or `claude mcp list`, should show `plugin:code-search:grep-app` as connected.

## Limits

- Tested on the main session and an `Explore` subagent. Other subagent types are untested.
- The block is guidance. It does not block `grep` or change any tool.
- Without `rg` on `PATH`, `rg` commands Claude composes will fail.
- A manually configured grep.app server hides the plugin's. If a user-level server (for example `gh-grep`) uses the same URL, Claude Code silently skips `plugin:code-search:grep-app`, with no error, and the skill's tool name does not exist. Remove the other server, for example `claude mcp remove gh-grep -s user`.
- grep.app returns about 10 files per call, with no total count. Narrow the query instead of paging.
- grep.app rejects bounded regex repeats such as `{0,200}`.
- grep.app returns transient HTTP 500 errors. Retry the call.
- Queries go to a third-party service. Do not put secrets or private code in them.
- The evals do not start an unmocked plugin MCP server. The two `grep-app` cases, `grep-app-vs-ripgrep` and `trigger-grep-app-1`, test skill routing only.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable code-search@adminhead` |
| Uninstall | `claude plugin uninstall code-search@adminhead` |

Both remove the guidance and disconnect the server, since nothing is written outside the plugin. Start a new conversation to be sure the block is gone.
