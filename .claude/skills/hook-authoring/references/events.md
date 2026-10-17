# Hook events: input and output reference

Condensed from https://code.claude.com/docs/en/hooks (raw: https://code.claude.com/docs/en/hooks.md), fetched 2026-10-17. Field names are copied from the doc; nothing here is inferred. When in doubt, re-fetch the doc.

## Common input fields

Every event's JSON carries these, plus the event-specific fields below.

| Field | Meaning |
| :- | :- |
| `session_id` | session identifier |
| `prompt_id` | UUID of the prompt being processed; absent before the first user input; matches the OpenTelemetry `prompt.id` |
| `transcript_path` | path to the conversation JSONL; written asynchronously, so it may lag the current turn |
| `cwd` | working directory when the hook fired; follows Claude into worktrees and after `cd`, while `${CLAUDE_PROJECT_DIR}` stays at the session's project root |
| `scratchpad_dir` | session scratchpad path; absent when none (v2.1.257+) |
| `permission_mode` | `default`, `plan`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`; "Manual" arrives as `default`; not on every event |
| `effort` | `{ "level": "low"\|"medium"\|"high"\|"xhigh"\|"max" }` on tool-use-context events when the model supports effort; also `$CLAUDE_EFFORT` in the env |
| `hook_event_name` | the event name |
| `agent_id`, `agent_type` | which subagent, in-process teammate, or `--agent` the hook fired in |

Only `SessionStart` may carry `model`. There is no `$CLAUDE_MODEL` env var. The hook process inherits the parent env minus `OTEL_*` exporter vars (and credentials under HIPAA config).

## Handler types per event

- All five (`command`, `http`, `mcp_tool`, `prompt`, `agent`): `PermissionDenied`, `PostToolBatch`, `PostToolUse`, `PostToolUseFailure`, `PreToolUse`, `Stop`, `SubagentStop`, `TaskCompleted`, `TaskCreated`, `TeammateIdle`, `UserPromptExpansion`, `UserPromptSubmit`.
- `PermissionRequest`: `command`, `http`, `mcp_tool`, `prompt` (no `agent`; an agent hook there is skipped).
- `command`, `http`, `mcp_tool` only: `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `Elicitation`, `ElicitationResult`, `FileChanged`, `InstructionsLoaded`, `MessageDisplay`, `Notification`, `PostCompact`, `PostModelSwitch`, `PreCompact`, `PreModelSwitch`, `SessionEnd`, `StopFailure`, `SubagentStart`, `WorktreeCreate`, `WorktreeRemove`.
- `SessionStart`, `Setup`: `command` and `mcp_tool` only. `mcp_tool` hooks are skipped on launch-time `SessionStart` (startup, `--continue`, `--resume`) and always on `Setup`; they run on later `SessionStart` (`/clear`, compaction).

## Handler fields

Common: `type` (required), `if` (permission-rule filter, tool events only; a hook with `if` on another event never runs), `timeout` (seconds; defaults 600 command/http/mcp_tool, 30 prompt, 60 agent; lowered to 30 on UserPromptSubmit/PreModelSwitch/PostModelSwitch and 10 on MessageDisplay; SessionEnd shares a 1.5 s budget raised up to 60 s by the largest per-hook `timeout` in settings files), `statusMessage` (spinner text), `once` (remove after first success; honored only in skill frontmatter).

`command`: `command` (required), `args` (exec form, no shell), `async`, `asyncRewake` (background, wakes Claude on exit 2 with stderr as a system reminder), `shell` (`bash`|`powershell`), `onFailure` (`continue`|`block`, v2.1.295+).

`http`: `url` (required), `headers`, `allowedEnvVars` (only listed vars interpolate into headers), `onFailure`. Body is the event JSON with `Content-Type: application/json`. 2xx + empty body = success; 2xx + JSON object = parsed as hook output; 2xx + other body, non-2xx, connection failure = non-blocking error. `allowedHttpHookUrls` and `httpHookAllowedEnvVars` settings apply to all sources.

`mcp_tool`: `server` (required; `plugin:<plugin>:<server>` for a plugin-bundled server), `tool` (required), `input` (string values take `${tool_input.file_path}`-style substitution from the hook input). Tool text output is read like command stdout; `isError: true` is a non-blocking error.

`prompt`: `prompt` (required; `$ARGUMENTS` = the hook input JSON, appended if absent; `\$` escapes), `model`, `timeout`, `continueOnBlock`. `agent`: same minus `continueOnBlock`; no `impossible` support.

## Exit codes and stdout

| stdout | exit 0 | exit 2 | other |
| :- | :- | :- | :- |
| valid JSON object | success, fields apply | blocking error; fields read but can't lift the block | success, exit code ignored, JSON decides (counts as failure under `onFailure: "block"`) |
| unparseable JSON / schema failure | non-blocking error | blocking error, stderr is the reason | non-blocking error |
| plain text or nothing | success | blocking error, stderr is the reason | non-blocking error, first stderr line shown |

Stdout is parsed as JSON only when the whole output is one object (optionally multi-line). Plain-text stdout becomes Claude context only on `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart`, `PostModelSwitch`. Claude never sees stderr on exit 0. Exceptions: `WorktreeCreate`/`WorktreeRemove` fail on any non-zero; `Stop`, `SubagentStop`, `TaskCompleted` and a plugin's `UserPromptSubmit` hook treat exit 2 + empty stdout + "No such file or directory" stderr as non-blocking; `Elicitation`/`ElicitationResult` apply `hookSpecificOutput` only on exit 0; `StopFailure` ignores everything except `terminalSequence`.

Timeouts: a timed-out `command`/`http`/`mcp_tool` hook's output is discarded, so it renders no decision, except `PreModelSwitch` (timeout blocks the switch) and hooks with `onFailure: "block"`. Async hooks have no enforced timeout; `asyncRewake` hooks do.

`onFailure: "block"` failures: can't start, exit code other than 0/2 (even with allow JSON), HTTP non-2xx or connection failure, timeout, invalid output. Does what exit 2 does on that event, except `PermissionRequest` where it denies. No effect on `Stop`, `SubagentStop`, `TaskCompleted`, `TeammateIdle`, or async hooks.

Multiple hooks: all matching hooks run in parallel to completion, then results merge; one `deny` doesn't stop siblings' side effects. `additionalContext` from every hook is kept. Same handler in several settings files runs once; a plugin's or skill's copy is separate.

## Universal JSON output fields

| Field | Default | Effect |
| :- | :- | :- |
| `continue` | `true` | `false` stops Claude entirely; wins over event-specific decisions |
| `stopReason` | none | shown to the user with `continue: false`; stays in the conversation |
| `suppressOutput` | `false` | accepted, no effect |
| `systemMessage` | none | warning shown to the user (SDK: `SDKInformationalMessage`); some events discard it or route it elsewhere |
| `terminalSequence` | none | OSC 0/1/2/9/99/777 or BEL only; ignored otherwise and in `-p`/SDK |

`additionalContext`, `systemMessage`, `initialUserMessage` and plain stdout are capped at 10,000 chars each; over that, Claude Code writes a file and passes its path plus a 2,000-char preview. `<system-reminder>` tags inside the string are escaped. Injected context is replayed, not re-run, on `--resume`/`--continue`, except `SessionStart`, which re-runs with `source: "resume"`/`"fork"`.

`additionalContext` placement: SessionStart/SubagentStart at conversation start; UserPromptSubmit/UserPromptExpansion beside the prompt; PreToolUse/PostToolUse/PostToolUseFailure/PostToolBatch beside the tool result; Stop/SubagentStop at turn end (conversation continues); PostModelSwitch with the next request.

## Decision control summary

| Events | Pattern |
| :- | :- |
| UserPromptSubmit, UserPromptExpansion, PostToolUse, PostToolUseFailure, PostToolBatch, Stop, SubagentStop, ConfigChange, PreCompact | top-level `decision: "block"`, `reason` |
| TeammateIdle, TaskCompleted | exit 2, or `continue: false` + `stopReason` |
| TaskCreated | exit 2 or `decision: "block"`; `continue: false` ignored |
| PreToolUse | `hookSpecificOutput.permissionDecision` allow/deny/ask/defer, `permissionDecisionReason`, `updatedInput`, `additionalContext` |
| PreModelSwitch | `permissionDecision` allow/deny/ask, or `decision: "block"` |
| PermissionRequest | `hookSpecificOutput.decision.behavior` allow/deny |
| PermissionDenied | `hookSpecificOutput.retry: true` |
| WorktreeCreate | path on stdout (command) or `hookSpecificOutput.worktreePath` (http) |
| WorktreeRemove | exit code only |
| Elicitation, ElicitationResult | `hookSpecificOutput.action` + `content`, or `decision: "block"` |
| MessageDisplay | `hookSpecificOutput.displayContent` |
| SessionStart, SubagentStart, PostModelSwitch | context only (`additionalContext`; SessionStart adds `initialUserMessage`, `watchPaths`, `sessionTitle`, `reloadSkills`) |
| Setup, Notification, SessionEnd, PostCompact, InstructionsLoaded, StopFailure, CwdChanged, DirectoryAdded, FileChanged | none |

Rewrites: `PreToolUse.updatedInput`, `PermissionRequest.decision.updatedInput`, `PostToolUse.updatedToolOutput`. `UserPromptSubmit` can't rewrite the prompt.

## Per-event detail

### SessionStart
Fires on `startup`, `resume` (`--resume`, `--continue`, `/resume`), `clear`, `compact`, `fork` (`--fork-session`, `/fork`, `/branch`, backgrounding). Runs in the background at launch; Claude's first response waits for it. Input: `source`, optional `model`, `agent_type` (with `--agent`), `session_title`; on resume/fork with prior responses (v2.1.251+): `seconds_since_last_response`, `context_tokens`, `prompt_cache_likely_expired`, `estimated_cache_write_usd`. Output (`hookSpecificOutput`): `additionalContext`, `initialUserMessage` (first user turn in `-p`), `sessionTitle` (startup/resume/fork), `watchPaths` (absolute paths for FileChanged), `reloadSkills` (re-scan skill dirs after hooks finish). Plain stdout becomes context. Exit 2: stderr shown to user as a hook error, session proceeds. `CLAUDE_ENV_FILE`: append `export NAME=value` lines; Bash runs the file before each command. PowerShell commands receive only plain assignments (v2.1.296+). Only `command` and `mcp_tool` types.

### Setup
Fires only on `claude --init-only`, `claude -p --init`, `claude -p --maintenance`; matcher `init`/`maintenance`; input `trigger`. Can't block; all JSON output discarded. Has `CLAUDE_ENV_FILE`. `--init-only` also runs SessionStart `startup` hooks, then exits. Only `command` type runs.

### InstructionsLoaded
Fires per CLAUDE.md / `.claude/rules/*.md` load, eagerly at start and lazily later. Matcher on `load_reason`: `session_start`, `nested_traversal`, `path_glob_match`, `include`, `compact`. Input: `file_path`, `memory_type` (`User`/`Project`/`Local`/`Managed`), `load_reason`, `globs?`, `trigger_file_path?`, `parent_file_path?`. No decision control; async, for audit.

### UserPromptSubmit
Fires on every prompt, including scheduled tasks, `/loop`, background subagents reporting back, cross-session messages. Default timeout 30 s; a timed-out hook's context is discarded and the prompt proceeds unless `onFailure: "block"`. Input: `prompt` (pasted text expanded, possibly inside `<pasted_content id="…">` lines), `session_title?`. For a typed `/command` the hook gets the literal line, not the expansion. Output: `decision: "block"` + `reason` (shown to user, not context); `hookSpecificOutput.additionalContext`, `sessionTitle`, `suppressOriginalPrompt`; plain stdout = context. Blocked prompt text still lands in the transcript file.

### UserPromptExpansion
Fires when a typed `/skill` or MCP prompt expands. Matcher on `command_name`. Input: `expansion_type` (`slash_command`|`mcp_prompt`), `command_name`, `command_args`, `command_source`, `prompt`. Output: `decision: "block"`, `reason`, `hookSpecificOutput.additionalContext`. Covers the path PreToolUse on `Skill` misses.

### MessageDisplay
Fires per batch of completed lines while assistant text streams (once per message with the whole text in `-p`/SDK). Default timeout 10 s. Input: `turn_id`, `message_id`, `index`, `final`, `delta`. Output: `hookSpecificOutput.displayContent`. Display only; transcript and Claude keep the original. No matcher.

### PreToolUse
Fires before any tool except `EndConversation`; not for `@file` mentions (set `CLAUDE_CODE_DISABLE_FILE_MENTIONS=1` to change that, v2.1.299+). Matcher on tool name. Input: `tool_name`, `tool_input`, `tool_use_id`, `mcp_server` `{name, source}` for MCP tools (v2.1.274+; trust `source`, not `name`). File-tool `file_path` is absolute with native separators. Tool inputs: Bash/PowerShell `command`, `description`, `timeout`, `run_in_background`; Write `file_path`, `content`; Edit `file_path`, `old_string`, `new_string`, `replace_all`; Read `file_path`, `offset`, `limit`; Glob `pattern`, `path`; Grep `pattern`, `path`, `glob`, `output_mode`, `-i`, `multiline`; WebFetch `url`, `prompt`, `offset`; WebSearch `query`, `allowed_domains`, `blocked_domains`; Agent `prompt`, `description`, `subagent_type`, `model`; AskUserQuestion `questions`, `answers`; ExitPlanMode `plan`, `planFilePath` (injected). Output: `permissionDecision` (`allow` skips the prompt but not deny/ask rules, network-path reads, `requiresUserInteraction` MCP tools, or plan-mode limits; `deny`; `ask` forces a prompt even in auto mode; `defer` only in `-p`, single tool call, for SDK round trips), `permissionDecisionReason` (ask: to user; deny: to Claude; allow/defer: debug log), `updatedInput` (whole object; permission rules re-evaluated against it), `additionalContext`. Precedence deny > defer > ask > allow. `AskUserQuestion`/`ExitPlanMode` need `allow` + `updatedInput` to be auto-answered. Exit 2 = deny with stderr to Claude. Timed-out command/http hooks don't block unless `onFailure: "block"`.

### PermissionRequest
Fires when Claude Code is about to prompt (or would auto-deny in a non-interactive session). Matcher on tool name. Input: `tool_name`, `tool_input` (no `tool_use_id`), `mcp_server?`, `permission_suggestions[]` (entries of `type` `addRules`/`replaceRules`/`removeRules`/`setMode`/`addDirectories`/`removeDirectories` with `destination` `session`/`localSettings`/`projectSettings`/`userSettings`). Output: `hookSpecificOutput.decision` `{behavior: allow|deny, updatedInput?, updatedPermissions?, message? (deny), interrupt? (deny)}`. Exit 2 not honored; stderr discarded. Not fired for sandboxed network requests (use Notification `permission_prompt`).

### PostToolUse
Fires after a successful tool call. Matcher on tool name; omit it to run after any tool and inspect `git status --porcelain`. Input: `tool_input`, `tool_response` (tool's structured output, e.g. Write `{filePath, type}`; Bash adds `bashEditDiff` in some modes, v2.1.269+; Agent returns `status`, `agentId`, `content`, `resolvedModel`, `totalTokens`, etc.), `tool_use_id`, `duration_ms`. Output: `decision: "block"` + `reason` (added beside the result; Claude still sees the original), `hookSpecificOutput.additionalContext`, `updatedToolOutput` (must match the tool's output shape, e.g. Bash `{stdout, stderr, interrupted, isImage}`; MCP output unvalidated), `updatedMCPToolOutput` (prefer the former), `classifierContext` (note to the auto-mode classifier, 2,000 chars shared, sync hooks only, v2.1.236+). Exit 2: stderr shown to Claude; the tool already ran.

### PostToolUseFailure
Fires when a tool that started failed (not for validation rejections or permission denials). Matcher on tool name. Input: `tool_name`, `tool_input`, `tool_use_id`, `mcp_server?`, `error` (Bash: first line `Exit code N`), `is_interrupt?`, `duration_ms?`. Output: `hookSpecificOutput.additionalContext`. Exit 2: stderr shown to Claude.

### PostToolBatch
Fires once after a parallel batch resolves, before the next model call. No matcher. Input: `tool_calls[]` of `{tool_name, tool_input, tool_use_id, tool_response}` where `tool_response` is the serialized `tool_result` content the model sees (different shape from PostToolUse). Output: `hookSpecificOutput.additionalContext`; `decision: "block"` or `continue: false` stops the loop before the next model call.

### PermissionDenied
Fires only when auto mode denies a call (not manual denials, hook blocks, or deny rules). Matcher on tool name. Input: `tool_name`, `tool_input`, `tool_use_id`, `mcp_server?`, `reason` (`[Rule Name]`, `Auto mode could not evaluate…`, or `Classifier unavailable`). Output: `hookSpecificOutput.retry: true` tells the model it may retry; ignored for no-verdict denials. Exit code and stderr ignored.

### Notification
Matcher on `notification_type`: `permission_prompt` (after ~6 s idle), `idle_prompt` (~60 s after a response), `auth_success`, `elicitation_dialog`, `elicitation_url_dialog`, `elicitation_complete`, `elicitation_response`, `agent_needs_input`, `agent_completed`, `quota_auto_resume_fired`, `quota_auto_resume_stale`, `quota_auto_resume_disabled`. Input: `message`, `title?`, `notification_type`. Fires even with desktop notifications off. No decision control; `systemMessage`/`continue` discarded; `terminalSequence` honored.

### SubagentStart
Fires when a subagent spawns or resumes, and per message for in-process teammates. Matcher on agent type (built-in names, custom frontmatter `name`, plugin-scoped `^my-plugin:reviewer$`). Input: `agent_id`, `agent_type`. Output: `hookSpecificOutput.additionalContext` injected into the subagent (deduplicated across re-runs). Can't block; exit 2 stderr goes to the subagent's transcript.

### SubagentStop
Fires when a subagent finishes, including Claude Code's internal agents (prompt suggestions, `/btw`), which carry an empty or session-level `agent_type`. Matcher on agent type. Input: `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, `background_tasks`, `session_crons`. Output as `Stop`, with `hookEventName: "SubagentStop"`. `decision: "block"` + `reason` keeps the subagent running. To inject context into the parent afterwards, use PostToolUse on `Agent`.

### TaskCreated / TaskCompleted
No matcher. Input: `task_id`, `task_subject`, `task_description?`, `teammate_name?`, `team_name` (deprecated), `agent_id?`. TaskCreated: exit 2 or `decision: "block"` deletes the task and returns the message as the tool error; `continue: false` ignored. TaskCompleted: exit 2 blocks completion with stderr fed to the model; `continue: false` + `stopReason` stops a teammate when a teammate's turn end triggered it, ignored when `TaskUpdate` did.

### Stop
Fires when the main agent finishes a turn; not on user interrupt (API errors fire StopFailure). No matcher. Input: `stop_hook_active` (true when already continuing because of a stop hook), `last_assistant_message` (use this, not the transcript), `background_tasks[]` (`id`, `type`, `status`, `description`, `command?`, `agent_type?`, `server?`, `tool?`, `name?`), `session_crons[]` (`id`, `schedule`, `recurring`, `prompt`). Output: `decision: "block"` + `reason` (required) continues with `reason` as Claude's next instruction; `hookSpecificOutput.additionalContext` continues as "Stop hook feedback" without a hook-error notice. Exit 2: stderr is the reason. Eight consecutive continuations are overridden (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` raises it); the count resets on any tool call. `/goal` is a built-in prompt-type Stop hook.

### StopFailure
Fires instead of Stop when the turn ends on an API error. Matcher on `error`: `rate_limit`, `overloaded`, `authentication_failed`, `oauth_org_not_allowed`, `account_on_hold`, `billing_error`, `invalid_request`, `model_not_found`, `server_error`, `max_output_tokens`, `cloud_credential_error` (v2.1.267+), `unknown`. Input: `error`, `error_details?`, `last_assistant_message?` (the rendered error text). Output and exit code ignored except `terminalSequence`.

### TeammateIdle
Agent teams only. No matcher. Input: `teammate_name`, `team_name` (deprecated), `agent_id?`. Exit 2: teammate keeps working with stderr as feedback. `continue: false` + `stopReason` stops it.

### ConfigChange
Fires when a settings file, managed-settings file, or skill file changes. Matcher on `source`: `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills`. Input: `source`, `file_path?`. Output: `decision: "block"` (or exit 2) prevents the change from applying to the running session; `reason` accepted but never shown; `policy_settings` can't be blocked. No message surfaces to the user or Claude on block, only the debug log.

### CwdChanged
Fires when a main-conversation shell command changes directory. No matcher. Input: `old_cwd`, `new_cwd`. Output: `watchPaths` (replaces the dynamic FileChanged list), `systemMessage` shown as a brief terminal notice. Has `CLAUDE_ENV_FILE`; variables written persist until the next CwdChanged clears them. Can't block.

### DirectoryAdded
Fires after `/add-dir` or the SDK `register_repo_root` request (not `--add-dir`, not the `/permissions` tab). Matcher `slash_command`/`register_repo_root`. Input: `directory`, `source`. Runs in the background (600 s default); can't block. `systemMessage` goes to Claude as context on the next turn for `slash_command`, to the debug log for `register_repo_root`.

### FileChanged
Fires when a watched file changes on disk, whatever wrote it. The matcher is split on `|` into literal filenames in the working directory to build the watch list, and also filters groups against the changed file's basename; omit the matcher for a group that handles dynamic `watchPaths`. Input: `file_path`, `event` (`change`|`add`|`unlink`). Output: `watchPaths`, `systemMessage` (brief notice). Has `CLAUDE_ENV_FILE`. Guard against rewrite loops (the hook re-fires after its own write).

### WorktreeCreate
Fires for `--worktree`, `EnterWorktree`, subagent `isolation: "worktree"`, workflows, background sessions, `claude remote-control` worktree mode. Replaces git entirely (`.worktreeinclude` not processed). No matcher. Input: `name` (slug). Output: command hook prints the created path as the last non-empty stdout line (other output to stderr); HTTP hook returns `hookSpecificOutput.worktreePath`. Any non-zero exit or missing path fails creation. Absolute paths with `.`/`..` segments or symlinks below the repo root are refused (v2.1.216+).

### WorktreeRemove
Fires when a hook-created worktree is removed at exit, `ExitWorktree` with `discard_changes: true`, background-session delete, or remote-control cleanup; not for finished subagents/workflow agents. No matcher. Input: `worktree_path`. Exit 0 = removed (the hook must actually delete it); non-zero with the directory still present = removal fails, no git fallback. JSON output discarded. Delete any branch the create hook made.

### PreCompact / PostCompact
Matcher `manual` (`/compact`) or `auto` (auto-compact, idle compaction). PreCompact input: `trigger`, `custom_instructions` (null for auto or no argument); exit 2 or `decision: "block"` blocks compaction (a block during context-limit recovery surfaces the API error). PostCompact input: `trigger`, `compact_summary`; no decision control. Both discard `systemMessage`/`continue`.

### PreModelSwitch
v2.1.251+. Fires for `/model`, the picker, `/config`, fast mode, SDK `set_model`; not for automatic fallbacks or resume. Matcher on the canonical target model name (alias/dated/Bedrock IDs resolve to it; unknown IDs run every hook). Input: `from_model`, `to_model`, `requested_model`, `source` (`command`|`picker`|`sdk`), `context_tokens`, `prompt_cache_warm`, `cache_ttl`, `estimated_cache_write_usd`, `pricing`. Output: `permissionDecision` allow/deny/ask (ask only works for interactive `/model`; elsewhere it refuses), `permissionDecisionReason`, or `decision: "block"`. `systemMessage` always shown. Timeout (default 30 s) blocks the switch. Precedence deny > ask > allow.

### PostModelSwitch
v2.1.251+. Fires after any model change including fallbacks and resume. Matcher as PreModelSwitch. Input: same fields with `source` also `auto` or `resume`. Output: plain stdout or `additionalContext` delivered with the next request (attached to the following one if the hook isn't done within 5 s of the next prompt). Can't block.

### SessionEnd
Matcher on `reason`: `clear`, `resume`, `logout`, `prompt_input_exit`, `other` (`bypass_permissions_disabled` was removed in v2.1.234). Input: `reason`. No decision control; JSON output discarded. 1.5 s default budget; raise with per-hook `timeout` (up to 60 s, settings-file hooks only) or `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`.

### Elicitation
Fires when an MCP server requests user input. Matcher on `mcp_server_name`. Input: `mcp_server_name`, `message`, `mode?` (`form`|`url`), `url?`, `elicitation_id?`, `requested_schema?`. Output (exit 0 only): `hookSpecificOutput.action` `accept` (+ `content` keyed by schema property), `decline`, `cancel`; no output leaves it to the dialog. Exit 2 or `decision: "block"` declines; a decline from any hook wins. `reason`/`systemMessage`/`continue` discarded; nobody sees why.

### ElicitationResult
Fires after the user answers (skipped when an Elicitation hook answered). Matcher on server name. Input: `mcp_server_name`, `action`, `mode?`, `elicitation_id?`, `content?`. Output (exit 0): `action: accept` with replacement `content` (whole object), `decline` (withholds values), `cancel` (sends the user's values). Check the input `action` is `accept` before returning `accept`. Exit 2 or `decision: "block"` blocks.

## Debugging

`claude --debug-file <path>` writes hook entries (`Hooks: PostToolUse:Write [cmd] finished with status 0 (31ms)`, `Hook output does not start with {`, `Hook JSON output had unrecognized keys`). `claude --debug` logs to `~/.claude/debug/<session-id>.txt`. `/debug` mid-session enables logging. `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` adds matcher counts. `/hooks` is a read-only browser of configured hooks with their source.
