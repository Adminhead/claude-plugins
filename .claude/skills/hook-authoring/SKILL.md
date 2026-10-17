---
name: hook-authoring
description: Writes and reviews classic Claude Code hooks, the `hooks` config in settings.json or a plugin's `hooks/hooks.json` with `command`, `http`, `mcp_tool`, `prompt` and `agent` handlers. It picks the event, writes the matcher and the stdin-JSON script, returns the decision through the right exit code or JSON shape, sets the timeout, installs the hook in the right scope and tests it. Use when asked to add, fix or audit a hook, to block or auto-approve a tool call, to run a formatter or tests after edits, to inject context at session start or per prompt, to set env vars for Bash with CLAUDE_ENV_FILE, or to keep Claude working with a Stop hook. Not for mods (TSX hooks modules that import `claude-code`), which the sibling `mod-authoring` skill covers.
---

# Hook authoring

A classic hook is a handler Claude Code runs at a lifecycle event: a shell command, an HTTP POST, an MCP tool call, a one-shot model prompt or a tool-using subagent. The handler gets the event as JSON (stdin or POST body) and answers with an exit code, stdout JSON or a response body. Source of truth: https://code.claude.com/docs/en/hooks (reference) and https://code.claude.com/docs/en/hooks-guide (examples). When memory and the doc disagree, the doc wins; re-fetch it with `curl -sL https://code.claude.com/docs/en/hooks.md` before relying on a field not listed here.

Mods are a different mechanism: a plugin's `hooks/register.tsx` registers JavaScript functions that run in Claude Code's own process and can draw UI. Those belong to the sibling `mod-authoring` skill. A plugin's `hooks/hooks.json` can hold both `"modules"` (mods) and classic `"hooks"`.

References in this skill: `references/events.md` (per-event input and output), `references/examples.md` (five worked hooks), `references/settings-and-scopes.md` (where hooks live, plugin schema, debugging).

## Workflow

1. **Pick the event.** Ask: does the thing need to be prevented (a `Pre*` event or `Stop`), reacted to (a `Post*` event, `Notification`, `SessionEnd`) or informed (`SessionStart`, `UserPromptSubmit`)? Use the table below. Prefer `FileChanged` over `PostToolUse` on `Edit|Write` when the trigger is "this file changed on disk", since Bash edits don't fire tool hooks matched on `Edit`. Prefer the permission system (`permissions.deny`) over a hook for a hard, unconditional block; hook `if` filters are best-effort.
2. **Pick the handler type.** `command` for anything deterministic (the default). `http` to hand the event to a service. `mcp_tool` to call a configured MCP server's tool (skipped on launch-time `SessionStart` and on `Setup`). `prompt` when the decision needs judgment over the hook input alone. `agent` when it needs to read files or run tests first (experimental, 60 s default, up to 50 turns). Not every event takes every type: `SessionStart` and `Setup` take only `command` and `mcp_tool`; `PermissionRequest` takes no `agent`; the observational events take no `prompt` or `agent`. `references/events.md` lists the sets.
3. **Write the matcher.** Plain names and `|`/`,` lists are exact matches (`Edit|Write`); any other character makes it an unanchored JS regex (`^Notebook`, `mcp__memory__.*`). Omit it, or use `""`/`"*"`, to match everything. A matcher on an event without matcher support is silently ignored. MCP tools are `mcp__<server>__<tool>`; a plugin-bundled server is `mcp__plugin_<plugin>_<server>__<tool>`. On tool events, narrow further per handler with `if` using permission-rule syntax (`"Bash(git *)"`, `"Edit(*.ts)"`); one rule per handler, no `&&`.
4. **Write the script.** Read all of stdin once (`input=$(cat)`), bound its length, pull fields with `jq -r` or `python3 -I -c 'import json,sys; ...'`, decide, print either nothing or exactly one JSON object, exit 0 or 2. Build JSON with `jq -n --arg`, never string concatenation. Keep stdout clean: anything before the `{` turns the whole output into plain text.
5. **Return the decision.** See the cheat sheet. Pick one channel per hook: exit 2 with a stderr reason, or exit 0 with JSON. Exit 1 is a non-blocking error, not a block.
6. **Set the timeout and failure mode.** `timeout` is in seconds. Defaults: 600 for `command`/`http`/`mcp_tool` (30 on `UserPromptSubmit`, `PreModelSwitch`, `PostModelSwitch`; 10 on `MessageDisplay`), 30 for `prompt`, 60 for `agent`; `SessionEnd` hooks share a 1.5 s budget. A timed-out gate on `PreToolUse` lets the call through unless `"onFailure": "block"` (v2.1.295+), so a policy hook should set it. Use `"async": true` only for side effects that must not block; async hooks cannot decide anything.
7. **Install in the right scope.** `~/.claude/settings.json` (you, every project), `.claude/settings.json` (committed, team), `.claude/settings.local.json` (you, this project), managed settings, plugin `hooks/hooks.json`, or skill/subagent frontmatter. Use exec form (`"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/x.js"]`) whenever a path placeholder is involved; in shell form wrap the placeholder in double quotes. `chmod +x` any script run directly.
8. **Test.** Pipe sample JSON through the script by hand and check `$?` and stdout. Then start `claude --debug-file /tmp/claude.log`, trigger the event, and grep the log for the hook's `Hooks:` line, `Hook output does not start with {`, or `Hook JSON output had unrecognized keys`. `/hooks` lists what loaded and from where. For a plugin, `claude plugin validate --strict plugins/<name>` catches an unquoted placeholder.
9. **Iterate.** Settings edits are hot-reloaded by the file watcher and fire `ConfigChange`; if `/hooks` doesn't show the change after a few seconds, restart the session.

## Event table

Can-block means exit 2 or a blocking JSON field stops the action. Input fields are in addition to the common ones: `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `permission_mode`, `effort`, `hook_event_name`, and `agent_id`/`agent_type` inside subagents.

| Event | Fires | Blocks? | Matcher on | Key input |
| :- | :- | :- | :- | :- |
| `SessionStart` | session start, resume, `/clear`, after compaction, fork | no | `startup`/`resume`/`clear`/`compact`/`fork` | `source`, `model?`, `session_title?` |
| `Setup` | only `--init-only`, or `-p --init`/`--maintenance` | no | `init`/`maintenance` | `trigger` |
| `UserPromptSubmit` | each prompt, also scheduled/background turns | yes | none | `prompt` |
| `UserPromptExpansion` | a typed `/command` expands | yes | command name | `command_name`, `command_args`, `expansion_type` |
| `PreToolUse` | before a tool runs | yes | tool name | `tool_name`, `tool_input`, `tool_use_id`, `mcp_server?` |
| `PermissionRequest` | Claude Code is about to prompt for permission | via `decision` only | tool name | `tool_name`, `tool_input`, `permission_suggestions` |
| `PermissionDenied` | auto mode denied a call | no (`retry`) | tool name | `tool_name`, `tool_input`, `reason` |
| `PostToolUse` | tool succeeded | feedback only | tool name | `tool_input`, `tool_response`, `duration_ms` |
| `PostToolUseFailure` | tool errored | no | tool name | `tool_input`, `error`, `is_interrupt` |
| `PostToolBatch` | a parallel batch resolved | yes | none | `tool_calls[]` |
| `Notification` | a notification is sent | no | notification type | `message`, `title`, `notification_type` |
| `MessageDisplay` | assistant text streams | no (display rewrite) | none | `delta`, `index`, `final` |
| `SubagentStart` / `SubagentStop` | subagent spawned / finished | no / yes | agent type | `agent_id`, `agent_type`; Stop adds `last_assistant_message` |
| `TaskCreated` / `TaskCompleted` | TaskCreate / task marked done | yes | none | `task_id`, `task_subject` |
| `Stop` | Claude finished the turn (not on interrupt) | yes | none | `stop_hook_active`, `last_assistant_message`, `background_tasks` |
| `StopFailure` | turn ended on an API error | no | error type | `error`, `error_details` |
| `TeammateIdle` | agent-team teammate going idle | yes | none | `teammate_name` |
| `InstructionsLoaded` | CLAUDE.md / rules file loaded | no | load reason | `file_path`, `memory_type`, `load_reason` |
| `ConfigChange` | a settings/skill file changed | yes (not `policy_settings`) | source | `source`, `file_path` |
| `CwdChanged` | Claude `cd`ed | no | none | `old_cwd`, `new_cwd` |
| `DirectoryAdded` | `/add-dir` | no | `slash_command`/`register_repo_root` | `directory`, `source` |
| `FileChanged` | a watched file changed | no | literal filenames to watch | `file_path`, `event` |
| `WorktreeCreate` / `WorktreeRemove` | worktree made / removed | non-zero fails it | none | `name` / `worktree_path` |
| `PreCompact` / `PostCompact` | before / after compaction | yes / no | `manual`/`auto` | `trigger`, `custom_instructions` / `compact_summary` |
| `PreModelSwitch` / `PostModelSwitch` | before / after a model change | yes / no | canonical target model | `from_model`, `to_model`, `source` |
| `Elicitation` / `ElicitationResult` | MCP server asks user / user answered | yes | MCP server name | `message`, `requested_schema` / `action`, `content` |
| `SessionEnd` | session ends | no | reason | `reason` |

## Output contract cheat sheet

Exit codes: **0** success, JSON on stdout is applied; **2** block on blocking events, stderr is the reason (stderr goes to Claude on `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`, `TaskCompleted`; to the user on `UserPromptSubmit`, `SessionStart`, `PreModelSwitch`); **other** non-blocking error, action proceeds, unless valid JSON was printed (then the JSON alone decides) or `onFailure: "block"` is set.

Universal JSON fields: `continue: false` + `stopReason` stops Claude entirely; `systemMessage` shows the user a warning; `terminalSequence` emits an allowlisted OSC/BEL escape; `suppressOutput` does nothing. Strings are capped at 10,000 chars.

| Event | Shape |
| :- | :- |
| `PreToolUse` | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"\|"deny"\|"ask"\|"defer","permissionDecisionReason":"...","updatedInput":{...},"additionalContext":"..."}}`. Precedence across hooks: deny > defer > ask > allow. `updatedInput` replaces the whole input. Top-level `decision`/`reason` are deprecated here. |
| `PermissionRequest` | `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"\|"deny","updatedInput":{...},"updatedPermissions":[...],"message":"...","interrupt":true}}}`. Exit 2 is not honored. |
| `PostToolUse` | top-level `{"decision":"block","reason":"..."}` plus `hookSpecificOutput.{additionalContext, updatedToolOutput, classifierContext}`. `updatedToolOutput` must match the tool's output shape. |
| `PostToolUseFailure`, `PostToolBatch`, `SubagentStart` | `hookSpecificOutput.additionalContext`; PostToolBatch also takes top-level `decision: "block"`. |
| `UserPromptSubmit`, `UserPromptExpansion` | top-level `{"decision":"block","reason":"..."}`; `hookSpecificOutput.additionalContext` (not top level; a top-level one is silently ignored); plain stdout also becomes context. UserPromptSubmit adds `sessionTitle`, `suppressOriginalPrompt`. Cannot rewrite the prompt. |
| `Stop`, `SubagentStop` | `{"decision":"block","reason":"..."}` keeps Claude working with `reason` as the next instruction; `hookSpecificOutput.additionalContext` does the same but is labelled feedback, not error. Check `stop_hook_active`; 8 consecutive blocks are overridden. |
| `SessionStart` | `hookSpecificOutput.{additionalContext, initialUserMessage, sessionTitle, watchPaths, reloadSkills}`; plain stdout becomes context. Also write `export X=Y` lines to `$CLAUDE_ENV_FILE` to set env for later Bash commands (also on `Setup`, `CwdChanged`, `FileChanged`). |
| `PermissionDenied` | `hookSpecificOutput.retry: true`. |
| `PreModelSwitch` | `permissionDecision` allow/deny/ask or top-level `decision: "block"`. Timeout blocks the switch. |
| `MessageDisplay` | `hookSpecificOutput.displayContent`. |
| `Elicitation`, `ElicitationResult` | `hookSpecificOutput.{action: accept\|decline\|cancel, content}`; applied only on exit 0. |
| `WorktreeCreate` | command hook prints the path as the last line of stdout; HTTP hook returns `hookSpecificOutput.worktreePath`. |
| `prompt`/`agent` handlers | the model answers `{"ok":true}` or `{"ok":false,"reason":"..."}`; prompt hooks may add `impossible: true` on Stop. `continueOnBlock: true` (prompt only) feeds the reason back instead of ending the turn. |

## Security rules

- Hooks run with your full user permissions, unsandboxed, in Claude Code's environment. Review a hook as you would a script you are about to `source`.
- `tool_input`, `prompt`, `last_assistant_message` and MCP `tool_response` are model- or server-controlled. Never interpolate them into a shell command or a regex without bounding length first (`head -c 1048576`, or `MAX_STDIN` in a script). Treat `.tool_input.command` as hostile text to inspect, never to eval.
- Always quote: `"$VAR"`, `"$CLAUDE_PROJECT_DIR"`. Prefer exec form (`args`) so paths are never shell-parsed. Pass values to `sh -c` as argv, not by splicing into the string.
- File paths in `tool_input.file_path` are absolute and use the platform's separators; normalize backslashes (`${P//\\//}`) before matching, match a segment like `/src/`, and reject `..`.
- Decide fail-closed or fail-open on purpose. A gate (`PreToolUse` deny list, `UserPromptSubmit` filter) should set `"onFailure": "block"` so a missing script or timeout doesn't let everything through. A convenience hook (formatter, notifier) should fail open and stay quiet. Don't put `onFailure: "block"` on `Stop`-family hooks; it has no effect there.
- A hook `"allow"` cannot loosen `deny`/`ask` rules, network-path reads, `requiresUserInteraction` MCP tools, or plan mode. A hook `"deny"` holds even in `bypassPermissions`.
- Don't rely on `if` to enforce policy; when Claude Code can't parse the Bash command it runs the hook regardless, so inspect the full command in the script.
- Workspace trust: `-p` runs treat the folder as trusted and run repo-committed hooks. Before scripting `claude -p` over a repo you didn't write, review its `.claude/` or pass `--settings '{"disableAllHooks": true}'`.
- `additionalContext` is read as text by Claude. Write facts ("This repo uses `bun test`"), not imperatives dressed as system commands, and never paste untrusted tool output into `classifierContext`.
- `suppressOriginalPrompt` only trims the block message; a blocked prompt is still in the transcript on disk.

## Rules specific to this repo's plugins

From `CLAUDE.md` and the docs:

- A plugin's `hooks/hooks.json` can hold both `"modules"` (mods) and classic `"hooks"`. Classic hooks do not fire for a tool call a mod's `tool.call` denied, and a mod handling `tool.check` can approve a call a classic `PreToolUse` hook blocked (unless the hook is in managed settings). Don't duplicate one policy across both layers; put the gate in one place.
- `CLAUDE_PLUGIN_DATA` (`~/.claude/plugins/data/<id>/`, survives updates) is exported to classic hook commands and resolves as `${CLAUDE_PLUGIN_DATA}` in `command`/`args`. It is not in a mod's `$.process.run` env. `CLAUDE_PLUGIN_ROOT` changes on every update, so never store state there.
- Hook-side scripts live in `plugins/<name>/scripts/` and may use real libraries (`@duckdb/node-api`, etc.), installed into `${CLAUDE_PLUGIN_DATA}` by a `SessionStart` hook that checks for `node_modules` and installs on miss. `Setup` only fires on `--init-only`/`--init`/`--maintenance`, so a plugin can't rely on it for installs.
- Name script specs `*.spec.ts` and run them with `bun test`, because `claude plugin test` loads every `*.test.*` file as a mod test and fails on a hook-side spec.
- In a plugin, reach scripts through `${CLAUDE_PLUGIN_ROOT}/scripts/...` in exec form; `${user_config.KEY}` substitutes only in exec form (`args`), and a shell-form `command` that references it fails to load. Shell-form hooks read `$CLAUDE_PLUGIN_OPTION_<KEY>` instead.
- `claude plugin validate --strict plugins/<name>` warns on an unquoted `${CLAUDE_PLUGIN_ROOT}` in a shell-form command.
- A plugin's `UserPromptSubmit` hook that exits 2 with a `No such file or directory` stderr is downgraded to a non-blocking error, so a mistyped path fails open there even without `onFailure`.

## Quality checklist

- [ ] Event matches the intent (prevent vs react vs inform) and supports the handler type used.
- [ ] Matcher is as narrow as possible; `Bash|PowerShell` when inspecting shell commands; MCP matcher ends in `.*` or names the full tool.
- [ ] Script reads stdin once, bounds its size, quotes every variable, and depends only on tools it checks for (`jq`, `python3`, `node`).
- [ ] Exactly one decision channel: exit 2 + stderr, or exit 0 + one JSON object. Fields sit under `hookSpecificOutput` with `hookEventName` where the event requires it.
- [ ] Exit 0 with no output on the "nothing to say" path. Formatter and notifier hooks never print to stdout.
- [ ] `timeout` set explicitly on anything slower than a few hundred ms; `onFailure: "block"` on gates; `async: true` only on side effects.
- [ ] Exec form with `args` when a placeholder is in the path; `chmod +x` done; path is absolute or placeholder-based.
- [ ] `Stop`-family hooks check `stop_hook_active` and exit 0 when already continuing.
- [ ] `SessionStart` hooks that add context are keyed on `source` (`compact` for re-injection, `startup|resume` for env) and stay fast; they run on every session.
- [ ] Tested by hand with sample JSON (`echo '{...}' | ./hook.sh; echo $?`) and once live with `--debug-file`.
- [ ] Installed in the scope the user asked for; a committed `.claude/settings.json` hook was reviewed as something teammates will run.

## Anti-patterns

- `exit 1` to block. It is a non-blocking error; the action proceeds.
- `timeout: 5000` meaning milliseconds. The field is seconds; that is 83 minutes.
- `async: true` on a `PreToolUse` or `PermissionRequest` gate. Async hooks can't decide anything.
- `permissionDecision` or `additionalContext` at the top level of the JSON. Parsed, silently ignored.
- `echo "..."` debug lines before the JSON object, or a shell profile that echoes on non-interactive shells. The output stops being JSON.
- A `PostToolUse` hook on `Edit|Write` to "catch every file change". Bash edits bypass it; use `FileChanged` or a `Stop` hook that runs `git status --porcelain`.
- Matching `Bash` alone in a shell-command policy; on Windows without Git Bash only the `PowerShell` tool exists.
- Reading `transcript_path` at `Stop` to get the final message. It can lag; use `last_assistant_message`.
- `"*"` as a `FileChanged` matcher. It registers a literal file named `*`; omit the matcher for the group that handles dynamic `watchPaths`.
- A `Stop` hook with no `stop_hook_active` check, looping until the 8-block cap.
- Several `PreToolUse` hooks that each set `updatedInput` on the same tool; the last to finish wins, non-deterministically.
- Stripping error detail with `updatedToolOutput` so Claude proceeds on a false assumption; the tool already ran and telemetry recorded the original.
- Expecting `Setup` to run on normal startup, or `SessionStart` `mcp_tool` hooks to run at launch.
- Starting a background process from a hook without redirecting its stdout/stderr; Claude Code refuses the capture and blocks the call.
