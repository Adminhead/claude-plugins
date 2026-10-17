# Subagent frontmatter reference

Sources, read 2026-10-17:

- https://code.claude.com/docs/en/sub-agents (section "Frontmatter reference" and the sections it links)
- https://code.claude.com/docs/en/plugins/components#agents (plugin agent rules)
- https://code.claude.com/docs/en/plugins-reference (manifest `agents` key, namespacing)

Only `name` and `description` are required. Field names are camelCase and must match exactly; Claude Code ignores an unrecognised field without reporting an error. From v2.1.296, `claude --debug` logs `does not recognize or apply` for up to five unknown top-level fields.

## Field table

The "Plugin" column says whether the field takes effect in a plugin's `agents/` directory. Fields marked no are ignored there for security reasons; ship the equivalent in the plugin's `hooks/hooks.json` or `.mcp.json`.

| Field | Required | Plugin | Description |
| :- | :- | :- | :- |
| `name` | Yes | Yes | Unique identifier, at most 256 characters, such as `code-reviewer`. Hooks receive it as `agent_type`. The filename needn't match. Can't contain `:` (reserved for `plugin:agent` identifiers) or start with `-`. |
| `description` | Yes | Yes | When Claude should delegate to this subagent. Loaded into context every turn. Combined descriptions over 15,000 tokens trigger a startup warning. |
| `tools` | No | Yes | Allowlist, comma-separated string or YAML list, such as `Read, Grep, Bash`. Inherits every tool available to subagents if omitted. If no entry resolves to a tool, the subagent fails to launch. Takes `mcp__<server>__*` for a whole MCP server. `Agent(type, ...)` restricts spawnable types, but only for a `claude --agent` main thread; in a subagent the parenthesised list is ignored. To preload skills use `skills`, not `Skill` here. |
| `disallowedTools` | No | Yes | Denylist, same format. Applied before `tools`. An entry with a specifier such as `Bash(git push *)` removes the whole tool. `mcp__github` or `mcp__github__*` removes one server; `mcp__*` removes all MCP tools. |
| `model` | No | Yes | `sonnet`, `opus`, `haiku`, `fable`, a full model ID such as `claude-opus-5-5`, or `inherit`. Omitted: the subagent model order applies (below). |
| `permissionMode` | No | No | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`, or `manual` (alias for `default`). Honoured only when the main conversation is in `default`, `dontAsk`, or `plan`; `bypassPermissions` applies only when the main conversation already is. |
| `maxTurns` | No | Yes | Maximum agentic turns. At the limit the output is returned marked partial and Claude can resume the subagent. |
| `autoCompactWindow` | No | Yes | Lower this subagent's auto-compact window to a token count from `100000` to `1000000`. Plain integer (`200k` parses as 200 and is ignored). v2.1.296+. |
| `skills` | No | Yes | Skills to preload at startup; full content is injected, up to the first 32 distinct names. Doesn't restrict which skills the subagent may invoke. Can't preload a skill with `disable-model-invocation: true`. |
| `mcpServers` | No | No | MCP servers for this subagent: a string naming an already-configured server, or an inline definition keyed by server name (`stdio`, `http`, `sse`, `ws`). Inline servers connect at start and disconnect at finish. Inline servers in a project `.claude/agents/` file load only after the folder is trusted. |
| `hooks` | No | No | Lifecycle hooks scoped to this subagent, same shape as `settings.json` hooks. `Stop` becomes `SubagentStop` when run as a subagent. Project-level frontmatter hooks need the workspace trust dialog accepted. |
| `memory` | No | Yes | Persistent directory scope: `user` (`~/.claude/agent-memory/<name>/`), `project` (`.claude/agent-memory/<name>/`), or `local` (`.claude/agent-memory-local/<name>/`). Enables Read, Write, Edit and injects the first 200 lines or 25 KB of `MEMORY.md`. No effect when auto memory is off. |
| `background` | No | Yes | `true` keeps the subagent in the background even when Claude wants the result in the foreground. |
| `omitClaudeMd` | No | Yes | `true` starts the subagent without user, project, and local CLAUDE.md files (managed policy files still load). Ignored when the agent is the main session via `--agent`. v2.1.271+. |
| `effort` | No | Yes | `low`, `medium`, `high`, `xhigh`, `max`; availability depends on the model. Overrides the session effort but not `CLAUDE_CODE_EFFORT_LEVEL`. |
| `isolation` | No | Yes | `worktree` runs the subagent in a temporary git worktree branched from the default branch. Cleaned up automatically if the subagent makes no changes. Only valid value. |
| `color` | No | Yes | `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, or `cyan`. Display only. |
| `initialPrompt` | No | No | Auto-submitted first user turn when the agent is the main session (`--agent` or the `agent` setting). Commands and skills are processed. |
| `experimental` | No | `cacheTtl` only | Map. `cacheTtl: 5m` or `1h` sets the prompt-cache lifetime for this subagent's requests. Other keys ignored. Read only from subagent files. v2.1.248+. |

The `--agents` CLI JSON form takes the same fields plus `prompt` (the body), and ignores `color` and `experimental`.

## Files Claude Code skips or loads differently

Project, user, and managed `agents/` directories:

- No `name`: treated as documentation beside the agents, not loaded.
- Opening `---` not on line 1: treated as having no frontmatter, so documentation.
- `name` starting with `-`, containing `:`, or longer than 256 chars: skipped, error in debug log.
- `name` but no `description`: skipped, reason in debug log.
- YAML that doesn't parse: skipped, parse error in debug log.

Plugin `agents/` directories: a file whose frontmatter has no `name` or doesn't parse still loads, under its filename, with the description `Agent from <plugin> plugin`. `claude plugin validate` finds these.

`claude plugin validate <dir>` works on any agents directory (v2.1.233+) and reports unparseable frontmatter, but not a parsed file that lacks `name`.

## Scope and precedence

| Location | Scope | Priority |
| :- | :- | :- |
| Managed settings `.claude/agents/` | Organisation | 1 (highest) |
| `--agents` CLI JSON | Session | 2 |
| `.claude/agents/` | Project (walked up to repo root; nearest wins) | 3 |
| `~/.claude/agents/` | User | 4 |
| Plugin `agents/` | Where the plugin is enabled | 5 |

Project and user directories are scanned recursively; subfolders don't affect the name. In a plugin, subfolders join the scoped name: `agents/review/security.md` in `my-plugin` is `my-plugin:review:security`. A frontmatter `name` replaces only the filename part. A file listed in the manifest `agents` key loads as `<plugin>:<name>` with no subfolder parts, and that key replaces the default `agents/` scan.

## Model resolution order

1. Per-invocation `model` parameter on the Agent call.
2. The definition's `model` field (`inherit` picks the main conversation's model).
3. `CLAUDE_CODE_SUBAGENT_MODEL`, when set.
4. The main conversation's model.

A family alias (`opus`) resolves to the main conversation's exact model when the main model is in that family, including a `[1m]` suffix. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` makes the environment variable override everything. Subagents inherit the session's extended-thinking setting; there is no per-subagent toggle.

## What a non-fork subagent starts with

- Its own system prompt (the body) plus environment details. Not the Claude Code system prompt.
- The delegation message Claude writes.
- Every CLAUDE.md the main conversation loads, unless `omitClaudeMd` (Explore and Plan skip these too).
- A git status snapshot (not configurable per agent; Explore and Plan skip it).
- Full content of preloaded `skills`.
- A sibling roster, only if its tools include `SendMessage` and another agent is named.

Never: conversation history, output style, the main conversation's auto memory, skills already invoked upstream, files already read upstream.

## Tool filters applied to every subagent

Removed regardless of `tools`: `Agent` at the depth limit, `AskUserQuestion`, `EndConversation`, `EnterPlanMode`, `ExitPlanMode` (unless `permissionMode: plan`), `ScheduleWakeup`, `WaitForMcpServers`, `Workflow`.

Background subagents (the default in interactive sessions) keep every MCP tool but only these built-ins: `Read`, `Grep`, `Glob`, `LSP`, `Bash`, `PowerShell`, `Edit`, `Write`, `NotebookEdit`, `WebFetch`, `WebSearch`, `TodoWrite`, `Skill`, `ToolSearch`, `EnterWorktree`, `ExitWorktree`, `Monitor`, `TaskStop`, `SendMessage`, `Artifact`, plus `SubagentHandback` where applicable. The same definition can therefore resolve to different tools in the foreground and the background.

## Permission mode behaviour

| Main conversation mode | Effect of the subagent's `permissionMode` |
| :- | :- |
| `bypassPermissions`, `acceptEdits`, `auto` | Ignored; the subagent runs in the main mode. Under `auto` the classifier also reviews the subagent's final report. |
| `default`, `dontAsk`, `plan` | Honoured, except `bypassPermissions` (kept as main mode) and `auto` when auto mode isn't available to the subagent. |

## Related limits

- Nesting: subagents may spawn subagents up to three layers below the main conversation (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`; `1` turns nesting off).
- Concurrency: 20 running subagents per session by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`).
- Output scanning (v2.1.210+): a subagent's final report is scanned; text imitating `<system-reminder>` or `Human:` gets a backslash, and permission-setting mentions get a `[harness: ...]` marker line. The report arrives under a header saying it carries no authority from the user.
- Disable a specific agent for the session with `permissions.deny: ["Agent(<name>)"]`.
