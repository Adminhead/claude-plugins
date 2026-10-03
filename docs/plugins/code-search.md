# code-search

Teaches Claude Code to search well. It prefers [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) over `grep` or `find`, queries a local [CodeGraph](https://github.com/colbymchenry/codegraph) symbol graph for code questions, looks up current library docs through [Context7](https://context7.com), and searches public GitHub code through [grep.app](https://grep.app). It adds a short block of search guidelines to each conversation, ships four skills, connects three MCP servers, and indexes git repos with CodeGraph at session start. Version 0.2.0 renamed the plugin from `ripgrep` and added grep.app. Version 0.3.0 adds Context7, CodeGraph, and auto-init.

## What it adds

| Component | Where | Effect |
| --- | --- | --- |
| `prompt.context` hook | `hooks/register.ts` | Appends a `codeSearch` block, "Code Search Guidelines", to the conversation's context |
| `SessionStart` hook | `hooks/codegraph-autoinit.json`, `scripts/codegraph-autoinit.sh` | Async, `startup` only. Runs `codegraph init` in a git repo that has no index (see Auto-init) |
| Skill `code-search:ripgrep` | `skills/ripgrep/SKILL.md` | Flag reference: bounding output, scoping, precise matching, ignore rules, finding files, pitfalls, recipes |
| Skill `code-search:codegraph` | `skills/codegraph/SKILL.md` | How to use `codegraph_explore`, the CLI fallback, and when to use `rg` instead |
| Skill `code-search:context7` | `skills/context7/SKILL.md` | How to use `resolve-library-id` and `query-docs` for version-specific library docs |
| Skill `code-search:grep-app` | `skills/grep-app/SKILL.md` | How to query public GitHub code for real-world usage of an API, option, config key, or error string |
| MCP server `context7` | `.mcp.json` | See Servers |
| MCP server `codegraph` | `.mcp.json` | See Servers |
| MCP server `grep-app` | `.mcp.json` | See Servers |
| Tests | `scripts/tests/check.sh` | Offline tests for the auto-init script |

The block says:

- Prefer the built-in `Grep` tool or explicit `rg` commands over `grep`.
- Do not use `grep -r` or `find | xargs grep`. `rg` respects `.gitignore`, `.ignore`, and hidden-file rules by default.
- In a project with a `.codegraph/` index, call `codegraph_explore` (pass `projectPath`) before Grep or Read to locate or understand code. Use `rg` for literal text, non-code files, or when the index is missing or still building. Details: the `code-search:codegraph` skill.
- Load the `code-search:ripgrep` skill for flag details and output-bounding patterns.
- Load the `code-search:context7` skill for current library, framework, SDK, or CLI docs.
- Load the `code-search:grep-app` skill for real-world usage of an API, library, config key, or error string across public GitHub code.

## Servers

| Server | Transport and endpoint | Auth | Tools |
| --- | --- | --- | --- |
| `context7` | HTTP, `https://mcp.context7.com/mcp` | Optional `CONTEXT7_API_KEY`, sent as `Authorization: Bearer ${CONTEXT7_API_KEY:-}` | `mcp__plugin_code-search_context7__resolve-library-id`, `...__query-docs` |
| `codegraph` | stdio, `codegraph serve --mcp`, `alwaysLoad: true` | None, local | `mcp__plugin_code-search_codegraph__codegraph_explore` and the other CodeGraph tools |
| `grep-app` | HTTP, `https://mcp.grep.app` | None | `mcp__plugin_code-search_grep-app__searchGitHub` |

Each shows as `plugin:code-search:<server>` in `/mcp`.

### context7

- With no key, the header is `Bearer ` and the server answers anonymously. A set key expands into the header. Whether Context7 bills a key sent this way is UNCONFIRMED.
- The bare URL is the same endpoint as the claude.ai Context7 connector, and the connector wins. While the "claude.ai Context7" connector is present, Claude Code silently drops `plugin:code-search:context7`, and the tools appear as `mcp__claude_ai_Context7__*`. To load the plugin's copy, either remove the connector at claude.ai, or start Claude Code with `ENABLE_CLAUDEAI_MCP_SERVERS=false`, which drops every claude.ai connector from Claude Code. Verified on 2.1.288 (2026-10-03): with that variable set, `plugin:code-search:context7` connects with tools `query-docs` and `resolve-library-id`.
- The skills use the bare tool names, so either copy works.
- `context7@claude-plugins-official` uses `?client=claude-code-plugin`, a different endpoint, so it would run as a second copy with its own tool prefix. Uninstall one of the two.
- The skill tells Claude to use whichever Context7 tools are connected.

### codegraph

- `codegraph` must be on `PATH`. There is no `npx` fallback.
- A user-level `codegraph` server with the identical command (`codegraph serve --mcp`) outranks the plugin's, and Claude Code silently skips the plugin's copy. The tools then carry the `mcp__codegraph__` prefix. The skills and the guidelines block use the bare tool name `codegraph_explore`, so either prefix works. Removing the user-level entry is optional.
- The server answers per project. Claude passes `projectPath` to query any indexed project.

### grep-app

- A manually configured grep.app server hides the plugin's. If a user-level server (for example `gh-grep`) uses the same URL, Claude Code silently skips `plugin:code-search:grep-app`, and the skill's tool name does not exist. Remove the other server, for example `claude mcp remove gh-grep -s user`.

## Auto-init

At session start the plugin indexes the session's git repo so `codegraph_explore` has something to query. The hook is async, so the first response does not wait for it, and the index build runs detached (`setsid`, else `nohup`), so it keeps going after the session ends, including after a short `claude -p` run. Until the index exists, the guidelines send Claude to `rg`. Claude itself never runs `init`, `index`, or `uninit` unless asked.

`scripts/codegraph-autoinit.sh` runs from the plugin data directory. That defeats a repo-pinned mise shim or a relative `PATH` entry, but not `PATH` entries the launching shell already exported (direnv and `mise activate` need explicit trust for that). It also refuses a `codegraph` binary that resolves inside the repo. It skips, with one line in `${CLAUDE_PLUGIN_DATA}/codegraph-autoinit.log`, when any of these holds:

1. The `codegraph_auto_init` option is `false`, `0`, `no`, or `off` (any case). How Claude Code serializes a false boolean into `CLAUDE_PLUGIN_OPTION_CODEGRAPH_AUTO_INIT` is UNCONFIRMED.
2. `codegraph` is not on `PATH`.
3. The project directory (`CLAUDE_PROJECT_DIR`, else the current directory) is not in a git repo.
4. The repo is a linked worktree, or the installed git is older than 2.31 (no `--path-format=absolute`). Only a worktree nested inside the main checkout resolves to the parent's index, which reflects the parent's branch. A worktree elsewhere gets no index and no auto-init.
5. The repo's top level is `$HOME` or `/`.
6. A `.codegraph/` containing `codegraph.db` exists at the top level or any ancestor below `$HOME`. A `.codegraph/` without the database is a partial index, and `init` rebuilds it. `~/.codegraph/` holds CodeGraph's global state (telemetry, daemons), not an index, so the ancestor walk stops at `$HOME`.
7. `git config --bool code-search.codegraph` is `false`.
8. The repo has more than `${CODE_SEARCH_CODEGRAPH_MAX_FILES:-25000}` tracked files (a submodule counts as one), or the cap is not a number.
9. Another session holds `${CLAUDE_PLUGIN_DATA}/autoinit.lock.d`. The lock covers the check-and-launch window only, and one older than 10 minutes is treated as stale. The detached init outlives the lock, so a very quick second session can still reach CodeGraph's own lock.

Otherwise it adds `/.codegraph/` to the repo's `info/exclude`, then launches `nice codegraph init -y <repo>` detached and appends its output and result to the log. The script exits 0 in every case, so it never fails a session. If `CLAUDE_PLUGIN_DATA` is unset it writes one line to stderr and exits.

Opt-outs:

| Scope | How |
| --- | --- |
| All repos | Set the plugin option `codegraph_auto_init` to `false` |
| One repo | `git config code-search.codegraph false` |
| Large repos | Lower `CODE_SEARCH_CODEGRAPH_MAX_FILES` in the environment |

Notes:

- The hook also fires in `claude -p` runs and eval sandboxes. A non-git directory stops at step 3.
- `init -y` may install git sync hooks when file watching is unavailable (WSL `/mnt` drives, `CODEGRAPH_NO_WATCH=1`). CodeGraph honors `core.hooksPath` there, so in a repo that uses husky this writes tracked files. Opt that repo out with `git config code-search.codegraph false`.
- CodeGraph telemetry follows your saved CodeGraph setting.
- Whether plugin hooks wait for the folder-trust dialog is UNCONFIRMED.

## Requirements

- `rg` on `PATH`. The guidelines work without it, but the `ripgrep` skill's commands need it.
- Written against rg 15.2.0. Other versions are untested.
- `codegraph` on `PATH` for the `codegraph` server and auto-init. Written against 1.6.1.
- `git` on `PATH` for auto-init.
- Network access to `mcp.context7.com` and `mcp.grep.app` for those servers.

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
- Claude loads each skill on demand. The `ripgrep` description matches tasks such as composing an `rg` command, replacing `grep` or `find`, listing files, searching ignored files, or fixing a search with too much or no output. The `codegraph` description matches how-it-works, who-calls, and what-would-break questions. The `context7` description matches library API and migration questions. The `grep-app` description matches requests for real-world usage examples or an exact error string.
- The three servers start with the plugin. Claude Code defers MCP tool definitions, so most tools add little to each session. `codegraph` sets `alwaysLoad`, so its tools load in full.
- In a git repo with no index, the SessionStart hook runs `codegraph init` in the background. It writes `.codegraph/` and one line to the repo's `.git/info/exclude`, and `~/.claude/CLAUDE.md` is untouched. Where file watching is unavailable, CodeGraph can also install git hooks (see Auto-init notes). Indexing keeps running after the session ends.
- `efficient-core:research` routes public code examples to `code-search:grep-app`, if installed.

## Configuration

| Name | Where | Default | Effect |
| --- | --- | --- | --- |
| `codegraph_auto_init` | Plugin option (`userConfig`) | `true` | Index git repos with CodeGraph at session start |
| `CONTEXT7_API_KEY` | Environment | unset | Sent as a bearer token to Context7. Optional |
| `CODE_SEARCH_CODEGRAPH_MAX_FILES` | Environment | `25000` | Tracked-file cap for auto-init |
| `code-search.codegraph` | `git config` per repo | unset | `false` opts that repo out of auto-init |

The guideline text is a constant in `hooks/register.ts`.

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/code-search
   ```
   The output should list `prompt.context` under the hooks module.
2. Run the auto-init tests. They use a stub `codegraph` and temp git repos, and need no network.
   ```
   bash plugins/code-search/scripts/tests/check.sh
   ```
3. Start a session and ask Claude to quote its "Code Search Guidelines" section. It should return the six bullets above.
   ```
   claude -p --plugin-dir plugins/code-search "Quote the 'Code Search Guidelines' section from your context, verbatim. Nothing else."
   ```
4. Check the servers. `/mcp` in a session, or `claude mcp list`, should show `plugin:code-search:context7`, `plugin:code-search:codegraph`, and `plugin:code-search:grep-app` as connected. A server skipped as a duplicate (see Servers) does not appear. Its tools show under the other server's prefix.
5. Open a session in a git repo with no index, then read the log.
   ```
   cat "$CLAUDE_PLUGIN_DATA/codegraph-autoinit.log"
   ```
   With a plugin installed from the marketplace, the file sits in the plugin's directory under `~/.claude/plugins/data/`.

## Limits

- Tested on the main session and an `Explore` subagent. Other subagent types are untested.
- The block is guidance. It does not block `grep` or change any tool.
- Without `rg` on `PATH`, `rg` commands Claude composes will fail.
- A manually configured grep.app server hides the plugin's. If a user-level server (for example `gh-grep`) uses the same URL, Claude Code silently skips `plugin:code-search:grep-app`, with no error, and the skill's tool name does not exist. Remove the other server, for example `claude mcp remove gh-grep -s user`.
- grep.app returns about 10 files per call, with no total count. Narrow the query instead of paging.
- grep.app rejects bounded regex repeats such as `{0,200}`.
- grep.app returns transient HTTP 500 errors. Retry the call.
- The evals do not start an unmocked plugin MCP server. The six cases test skill routing only: `grep-app-vs-ripgrep`, `trigger-grep-app-1`, `context7-vs-grep-app`, `trigger-context7-1`, `codegraph-vs-ripgrep`, and `ripgrep-vs-codegraph`.
- Auto-init indexes only on `startup`, not on resume, clear, or compact. A repo opened later in a long session is indexed at the next startup.
- The index is a snapshot kept fresh by CodeGraph's own watcher. When the output flags stale files, Claude reads them directly.
- Context7 and CodeGraph servers can be duplicates of servers you already configured. See Servers.
- Queries to Context7 and grep.app go to third-party services. Do not put secrets or private code in them.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable code-search@adminhead` |
| Uninstall | `claude plugin uninstall code-search@adminhead` |

Both remove the guidance and disconnect the servers. Auto-init stops, but any `.codegraph/` directories it created stay. Delete one with `codegraph uninit` in that repo, and remove the `/.codegraph/` line from `.git/info/exclude` if you like. Start a new conversation to be sure the block is gone.
